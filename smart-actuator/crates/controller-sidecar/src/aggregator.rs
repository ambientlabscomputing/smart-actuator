//! Periodic joint-state aggregator.
//!
//! Polls every connected actuator in parallel and publishes the resulting
//! `Vec<JointStateSnapshot>` to a tokio broadcast channel so both the gRPC
//! streaming RPC and the in-process state cache can consume it.

use crate::client_pool::ActuatorClientPool;
use crate::types::JointStateSnapshot;
use actuator_proto::actuator::{actuator_service_client::ActuatorServiceClient, ReadRequest};
use futures::future::join_all;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, Mutex};
use tonic::transport::Channel;
use tracing::{debug, info, warn};

/// Capacity of the broadcast channel (number of frames that can be buffered
/// before slow consumers start lagging).
const CHANNEL_CAPACITY: usize = 64;

/// After this many consecutive read failures, the actuator is considered dead
/// and is removed from the pool. At 100 Hz this is ~3 s of unreachable.
const STALE_PEER_THRESHOLD: u32 = 300;

pub struct JointStateAggregator {
    pool: Arc<Mutex<ActuatorClientPool>>,
    tx: broadcast::Sender<Vec<JointStateSnapshot>>,
    poll_interval: Duration,
}

impl JointStateAggregator {
    pub fn new(pool: Arc<Mutex<ActuatorClientPool>>, poll_interval: Duration) -> Self {
        let (tx, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self {
            pool,
            tx,
            poll_interval,
        }
    }

    /// Subscribe to the joint state broadcast stream.
    pub fn subscribe(&self) -> broadcast::Receiver<Vec<JointStateSnapshot>> {
        self.tx.subscribe()
    }

    /// Run the aggregator loop until the provided cancellation token is cancelled.
    /// This is intended to be spawned as a background tokio task.
    pub async fn run(&self, mut cancel: tokio::sync::watch::Receiver<bool>) {
        let mut interval = tokio::time::interval(self.poll_interval);
        // Per-actuator fault tracking. Only log on transition (healthy ↔ fault)
        // to avoid drowning stdout when an actuator is permanently unreachable.
        // `consecutive_failures` also drives auto-pruning of dead peers.
        let mut faulted: HashMap<String, bool> = HashMap::new();
        let mut consecutive_failures: HashMap<String, u32> = HashMap::new();

        loop {
            tokio::select! {
                _ = interval.tick() => {}
                _ = cancel.changed() => {
                    if *cancel.borrow() {
                        break;
                    }
                }
            }

            let snapshots = self.poll_all().await;

            // Inspect snapshots for fault transitions and prune dead peers.
            let mut to_prune: Vec<String> = Vec::new();
            for snap in &snapshots {
                let id = &snap.actuator_id;
                let is_faulted = snap.fault.is_some();
                let was_faulted = faulted.get(id).copied().unwrap_or(false);

                if is_faulted {
                    if !was_faulted {
                        warn!(
                            actuator_id = %id,
                            error = %snap.fault.as_deref().unwrap_or(""),
                            "Actuator went unreachable"
                        );
                    }
                    let n = consecutive_failures.entry(id.clone()).or_insert(0);
                    *n += 1;
                    if *n == STALE_PEER_THRESHOLD {
                        info!(
                            actuator_id = %id,
                            failures = *n,
                            "Pruning unreachable actuator from pool (stale peer)"
                        );
                        to_prune.push(id.clone());
                    }
                } else {
                    if was_faulted {
                        info!(actuator_id = %id, "Actuator recovered");
                    }
                    consecutive_failures.remove(id);
                }
                faulted.insert(id.clone(), is_faulted);
            }

            if !to_prune.is_empty() {
                let mut pool = self.pool.lock().await;
                for id in &to_prune {
                    pool.remove_peer(id);
                    faulted.remove(id);
                    consecutive_failures.remove(id);
                }
            }

            if self.tx.send(snapshots).is_err() {
                // No active receivers — that's fine, keep running.
                debug!("JointStateAggregator: no receivers, continuing");
            }
        }
        tracing::info!("JointStateAggregator stopped");
    }

    async fn poll_all(&self) -> Vec<JointStateSnapshot> {
        // Clone clients out of the pool so we can release the lock before
        // making any RPC calls, then poll all actuators in parallel.
        let clients: Vec<(String, String, ActuatorServiceClient<Channel>)> = {
            let mut pool = self.pool.lock().await;
            let id_to_joint: std::collections::HashMap<String, String> = pool
                .live_endpoints()
                .iter()
                .map(|e| (e.id.clone(), e.joint_name.clone()))
                .collect();
            pool.iter_mut()
                .map(|(id, client)| {
                    let joint_name = id_to_joint.get(id).cloned().unwrap_or_else(|| id.clone());
                    (id.clone(), joint_name, client.clone())
                })
                .collect()
        };

        let tasks: Vec<_> = clients
            .into_iter()
            .map(|(id, joint_name, mut client)| async move {
                // Clone the client for each parallel call — tonic clients wrap
                // an Arc<Channel> so cloning is cheap.
                let (mut c_vel, mut c_cur, mut c_tmp) =
                    (client.clone(), client.clone(), client.clone());
                let (pos_r, vel_r, cur_r, tmp_r) = tokio::join!(
                    client.read_position(tonic::Request::new(ReadRequest {})),
                    c_vel.read_velocity(tonic::Request::new(ReadRequest {})),
                    c_cur.read_current(tonic::Request::new(ReadRequest {})),
                    c_tmp.read_temperature(tonic::Request::new(ReadRequest {})),
                );

                match pos_r {
                    Ok(pos) => JointStateSnapshot {
                        actuator_id: id,
                        joint_name,
                        angle_rad: pos.into_inner().angle,
                        velocity_rad_s: vel_r.ok().map_or(0.0, |r| r.into_inner().velocity),
                        current_a: cur_r.ok().map_or(0.0, |r| r.into_inner().current),
                        temperature_c: tmp_r.ok().map_or(0.0, |r| r.into_inner().temperature),
                        fault: None,
                        captured_at: Instant::now(),
                    },
                    Err(e) => {
                        // Per-tick read failures are noisy when an actuator is
                        // permanently unreachable. The `run` loop handles
                        // transition logging and stale-peer pruning, so here
                        // we log at debug for diagnostic-only visibility.
                        debug!(actuator_id = %id, error = %e, "Failed to read from actuator");
                        JointStateSnapshot {
                            actuator_id: id,
                            joint_name,
                            angle_rad: 0.0,
                            velocity_rad_s: 0.0,
                            current_a: 0.0,
                            temperature_c: 0.0,
                            fault: Some(e.to_string()),
                            captured_at: Instant::now(),
                        }
                    }
                }
            })
            .collect();

        join_all(tasks).await
    }
}
