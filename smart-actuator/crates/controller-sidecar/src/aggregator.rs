//! Periodic joint-state aggregator.
//!
//! Polls every connected actuator in parallel and publishes the resulting
//! `Vec<JointStateSnapshot>` to a tokio broadcast channel so both the gRPC
//! streaming RPC and the in-process state cache can consume it.

use crate::client_pool::ActuatorClientPool;
use crate::types::JointStateSnapshot;
use actuator_proto::actuator::ReadRequest;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, warn};

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
            if self.tx.send(snapshots).is_err() {
                // No active receivers — that's fine, keep running.
                debug!("JointStateAggregator: no receivers, continuing");
            }
        }
        tracing::info!("JointStateAggregator stopped");
    }

    async fn poll_all(&self) -> Vec<JointStateSnapshot> {
        let mut pool = self.pool.lock().await;
        let mut results = Vec::with_capacity(pool.len());

        // Collect futures for all clients.
        // We can't easily run them in parallel while holding the Mutex, so we
        // poll sequentially here.  For a large number of actuators, upgrade to
        // a separate per-client task architecture.
        // TODO: parallel polling via per-actuator background tasks.
        for (id, client) in pool.iter_mut() {
            let req = tonic::Request::new(ReadRequest {});
            match client.read_position(req).await {
                Ok(resp) => {
                    let pos = resp.into_inner();
                    results.push(JointStateSnapshot {
                        actuator_id: id.clone(),
                        joint_name: id.clone(), // pool doesn't store joint_name; TODO: pass through
                        angle_rad: pos.angle,
                        velocity_rad_s: 0.0, // TODO: use ReadVelocity
                        current_a: 0.0,      // TODO: use ReadCurrent
                        fault: None,
                        captured_at: Instant::now(),
                    });
                }
                Err(e) => {
                    warn!(actuator_id = %id, error = %e, "Failed to read position from actuator");
                    results.push(JointStateSnapshot {
                        actuator_id: id.clone(),
                        joint_name: id.clone(),
                        angle_rad: 0.0,
                        velocity_rad_s: 0.0,
                        current_a: 0.0,
                        fault: Some(e.to_string()),
                        captured_at: Instant::now(),
                    });
                }
            }
        }
        results
    }
}
