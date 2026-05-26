//! E-stop broadcaster — fans out an Abort command to all connected actuators.

use crate::client_pool::ActuatorClientPool;
use actuator_proto::actuator::ReadRequest;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

pub struct EStopBroadcaster {
    pool: Arc<Mutex<ActuatorClientPool>>,
}

impl EStopBroadcaster {
    pub fn new(pool: Arc<Mutex<ActuatorClientPool>>) -> Self {
        Self { pool }
    }

    /// Send an Abort to every connected actuator.
    /// Errors are logged but do not abort the broadcast to other actuators.
    pub async fn broadcast(&self, reason: &str) {
        info!(reason = reason, "E-stop broadcast triggered");
        let mut pool = self.pool.lock().await;
        for (id, client) in pool.iter_mut() {
            let req = tonic::Request::new(ReadRequest {});
            match client.abort(req).await {
                Ok(resp) => {
                    let r = resp.into_inner();
                    if r.success {
                        info!(actuator_id = %id, "E-stop acknowledged");
                    } else {
                        warn!(
                            actuator_id = %id,
                            message = %r.message,
                            "Actuator rejected E-stop (reason: {})",
                            reason
                        );
                    }
                }
                Err(e) => {
                    error!(actuator_id = %id, error = %e, "gRPC error during E-stop broadcast");
                }
            }
        }
    }
}
