//! Deadman watchdog.
//!
//! If the Brain stops sending heartbeats for longer than the configured
//! timeout, the watchdog sets the `armed` flag to false, causing the sidecar
//! to reject new motion commands until heartbeats resume.  Existing setpoints
//! remain active in the actuators (hold-last-position).

use crate::config::WatchdogConfig;
use std::sync::{
    atomic::{AtomicBool, AtomicI64, Ordering},
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

struct HeartbeatState {
    last_seen_secs: AtomicI64,
    armed: AtomicBool,
}

/// Shared state updated by heartbeat RPCs and read by motion-command handlers.
#[derive(Clone)]
pub struct HeartbeatHandle(Arc<HeartbeatState>);

impl HeartbeatHandle {
    pub fn new() -> Self {
        Self(Arc::new(HeartbeatState {
            last_seen_secs: AtomicI64::new(now_secs()),
            armed: AtomicBool::new(true),
        }))
    }

    /// Call this whenever a Heartbeat RPC is received from the Brain.
    pub fn touch(&self) {
        self.0.last_seen_secs.store(now_secs(), Ordering::Relaxed);
        self.0.armed.store(true, Ordering::Relaxed);
    }

    pub fn elapsed_secs(&self) -> i64 {
        now_secs() - self.0.last_seen_secs.load(Ordering::Relaxed)
    }

    /// Returns false when the watchdog has timed out; motion commands should
    /// be refused until the Brain reconnects and sends a new heartbeat.
    pub fn is_armed(&self) -> bool {
        self.0.armed.load(Ordering::Relaxed)
    }

    /// Disarm — called by the watchdog when timeout is exceeded.
    fn disarm(&self) {
        self.0.armed.store(false, Ordering::Relaxed);
    }
}

pub struct Watchdog {
    handle: HeartbeatHandle,
    config: WatchdogConfig,
}

impl Watchdog {
    pub fn new(handle: HeartbeatHandle, config: WatchdogConfig) -> Self {
        Self { handle, config }
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
                    if self.handle.is_armed() {
                        warn!(
                            elapsed_secs = elapsed,
                            timeout_secs = timeout,
                            "Brain heartbeat timeout — disarming command intake (hold last position)"
                        );
                        self.handle.disarm();
                    }
                    // Disarmed state is logged once per timeout crossing.
                    // Subsequent checks are silent until the Brain reconnects.
                } else {
                    warn!(
                        elapsed_secs = elapsed,
                        timeout_secs = timeout,
                        "Brain heartbeat timeout (watchdog disabled — no action)"
                    );
                }
            } else if !self.handle.is_armed() {
                // Brain reconnected — re-arm is handled by touch() on the next
                // Heartbeat RPC; this log confirms the watchdog sees it.
                info!("Brain heartbeat resumed — watchdog re-armed");
            }
        }
        info!("Watchdog stopped");
    }
}
