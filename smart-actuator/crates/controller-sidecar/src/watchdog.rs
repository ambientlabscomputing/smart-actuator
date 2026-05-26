//! Deadman watchdog.
//!
//! If the Brain stops sending heartbeats for longer than the configured
//! timeout, the watchdog triggers an E-stop across all connected actuators.

use crate::config::WatchdogConfig;
use crate::estop::EStopBroadcaster;
use std::sync::{
    atomic::{AtomicI64, Ordering},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Shared atomic timestamp (Unix seconds) of the last received heartbeat.
#[derive(Clone)]
pub struct HeartbeatHandle(Arc<AtomicI64>);

impl HeartbeatHandle {
    pub fn new() -> Self {
        Self(Arc::new(AtomicI64::new(now_secs())))
    }

    /// Call this whenever a Heartbeat RPC is received from the Brain.
    pub fn touch(&self) {
        self.0.store(now_secs(), Ordering::Relaxed);
    }

    pub fn elapsed_secs(&self) -> i64 {
        now_secs() - self.0.load(Ordering::Relaxed)
    }
}

pub struct Watchdog {
    handle: HeartbeatHandle,
    estop: Arc<EStopBroadcaster>,
    config: WatchdogConfig,
}

impl Watchdog {
    pub fn new(handle: HeartbeatHandle, estop: Arc<EStopBroadcaster>, config: WatchdogConfig) -> Self {
        Self { handle, estop, config }
    }

    /// Run the watchdog loop until the cancellation watch fires.
    pub async fn run(self, mut cancel: tokio::sync::watch::Receiver<bool>) {
        let interval = Duration::from_secs(self.config.check_interval_secs);
        let timeout = self.config.timeout_secs as i64;
        let enabled = self.config.enabled;

        loop {
            tokio::select! {
                _ = tokio::time::sleep(interval) => {}
                _ = cancel.changed() => {
                    if *cancel.borrow() {
                        break;
                    }
                }
            }

            let elapsed = self.handle.elapsed_secs();
            if elapsed > timeout {
                if enabled {
                    warn!(
                        elapsed_secs = elapsed,
                        timeout_secs = timeout,
                        "Brain heartbeat timeout — triggering E-stop"
                    );
                    self.estop.broadcast("watchdog timeout").await;
                } else {
                    warn!(
                        elapsed_secs = elapsed,
                        timeout_secs = timeout,
                        "Brain heartbeat timeout (watchdog disabled — no E-stop)"
                    );
                }
            }
        }
        info!("Watchdog stopped");
    }
}
