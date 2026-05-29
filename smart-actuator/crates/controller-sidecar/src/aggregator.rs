//! Periodic joint-state aggregator.
//!
//! Polls every connected actuator in parallel and publishes the resulting
//! `Vec<JointStateSnapshot>` to a tokio broadcast channel so both the gRPC
//! streaming RPC and the in-process state cache can consume it.

use crate::client_pool::ActuatorClientPool;
use crate::types::JointStateSnapshot;
use actuator_proto::wire::async_wire::WireClient;
use futures::future::join_all;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, info, warn};

/// Capacity of the broadcast channel (number of frames that can be buffered
/// before slow consumers start lagging).
const CHANNEL_CAPACITY: usize = 64;

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
        // Per-actuator fault tracking — only log on healthy↔fault transitions
        // to avoid drowning stdout when an actuator is permanently unreachable.
        // WireClient handles reconnection transparently inside call_raw; the
        // aggregator never needs to touch the pool lock to do so.
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

            // Log fault transitions only.
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
                } else {
                    if was_faulted {
                        info!(actuator_id = %id, "Actuator recovered");
                    }
                    consecutive_failures.remove(id);
                }
                faulted.insert(id.clone(), is_faulted);
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
        let clients: Vec<(String, String, WireClient)> = {
            let pool = self.pool.lock().await;
            let id_to_joint: std::collections::HashMap<String, String> = pool
                .live_endpoints()
                .iter()
                .map(|e| (e.id.clone(), e.joint_name.clone()))
                .collect();
            pool.iter()
                .map(|(id, client)| {
                    let joint_name = id_to_joint.get(id).cloned().unwrap_or_else(|| id.clone());
                    (id.clone(), joint_name, client)
                })
                .collect()
        };

        let tasks: Vec<_> = clients
            .into_iter()
            .map(|(id, joint_name, client)| async move {
                // WireClient uses a single serial TCP stream — concurrent calls
                // are serialized through its internal Mutex anyway, so
                // tokio::join! gives no throughput benefit and makes the
                // timeout budget unpredictable.  Do reads sequentially instead.
                //
                // Per-call budget: 4 reads × ~50 ms worst-case WiFi RTT = 200 ms.
                // Individual call timeout set to 120 ms; if any one read misses
                // it we still have a valid snapshot for the other fields.
                let per_call = Duration::from_millis(120);

                let pos_r = tokio::time::timeout(per_call, client.read_position()).await
                    .unwrap_or_else(|_| Err(actuator_proto::wire::WireError::Io(
                        std::io::Error::new(std::io::ErrorKind::TimedOut, "read_position timeout")
                    )));
                let vel_r = tokio::time::timeout(per_call, client.read_velocity()).await
                    .unwrap_or_else(|_| Ok(Default::default()));
                let cur_r = tokio::time::timeout(per_call, client.read_current()).await
                    .unwrap_or_else(|_| Ok(Default::default()));
                let tmp_r = tokio::time::timeout(per_call, client.read_temperature()).await
                    .unwrap_or_else(|_| Ok(Default::default()));

                match pos_r {
                    Ok(pos) => JointStateSnapshot {
                        actuator_id: id,
                        joint_name,
                        angle_rad: pos.angle,
                        velocity_rad_s: vel_r.ok().map_or(0.0, |r| r.velocity),
                        current_a: cur_r.ok().map_or(0.0, |r| r.current),
                        temperature_c: tmp_r.ok().map_or(0.0, |r| r.temperature),
                        fault: None,
                        captured_at: Instant::now(),
                    },
                    Err(e) => {
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
