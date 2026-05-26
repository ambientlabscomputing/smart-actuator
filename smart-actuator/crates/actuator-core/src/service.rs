use tracing::{debug, info};

use crate::types::{CommandResponse, CurrentResponse, PositionResponse, VelocityResponse};

/// The actuator service contract — transport-independent.
/// Both the real firmware and the simulator implement this trait.
#[async_trait::async_trait]
pub trait Service: Send + Sync {
    async fn start(&self);
    async fn stop(&self);

    // ── Level 1: command RPCs ────────────────────────────────────────────────

    /// Set the target position (radians).
    async fn set_position(&self, angle: f64) -> CommandResponse;

    /// Set the target velocity (rad/s).
    async fn set_velocity(&self, velocity: f64) -> CommandResponse;

    /// Set the target torque (N·m).
    async fn set_torque(&self, torque: f64) -> CommandResponse;

    // ── Level 1: telemetry RPCs ──────────────────────────────────────────────

    /// Return the current position.
    async fn read_position(&self) -> PositionResponse;

    /// Return the current velocity.
    async fn read_velocity(&self) -> VelocityResponse;

    /// Return the current draw.
    async fn read_current(&self) -> CurrentResponse;
}

/// Stub implementation — stores the last commanded value, no dynamics.
/// This is the current-generation simulator. A dynamics model will replace
/// the state fields here once physics is added (RFD-3 S2).
pub struct AppService {
    // Interior mutability via a lightweight async-aware mutex so the service
    // can be shared across tonic's multi-threaded executor without cloning.
    state: tokio::sync::Mutex<ActuatorState>,
}

struct ActuatorState {
    position: f64,
    velocity: f64,
    torque: f64,
}

impl AppService {
    pub fn new() -> Self {
        Self {
            state: tokio::sync::Mutex::new(ActuatorState {
                position: 0.0,
                velocity: 0.0,
                torque: 0.0,
            }),
        }
    }
}

impl Default for AppService {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl Service for AppService {
    async fn start(&self) {
        info!("AppService started");
    }

    async fn stop(&self) {
        info!("AppService stopped");
    }

    async fn set_position(&self, angle: f64) -> CommandResponse {
        debug!(angle, "set_position");
        self.state.lock().await.position = angle;
        CommandResponse {
            success: true,
            message: "Position set".into(),
        }
    }

    async fn set_velocity(&self, velocity: f64) -> CommandResponse {
        debug!(velocity, "set_velocity");
        self.state.lock().await.velocity = velocity;
        CommandResponse {
            success: true,
            message: "Velocity set".into(),
        }
    }

    async fn set_torque(&self, torque: f64) -> CommandResponse {
        debug!(torque, "set_torque");
        self.state.lock().await.torque = torque;
        CommandResponse {
            success: true,
            message: "Torque set".into(),
        }
    }

    async fn read_position(&self) -> PositionResponse {
        PositionResponse {
            angle: self.state.lock().await.position,
        }
    }

    async fn read_velocity(&self) -> VelocityResponse {
        VelocityResponse {
            velocity: self.state.lock().await.velocity,
        }
    }

    async fn read_current(&self) -> CurrentResponse {
        // Stub: no current sensor in simulation yet.
        CurrentResponse { current: 0.0 }
    }
}

// ── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn svc() -> AppService {
        AppService::new()
    }

    #[tokio::test]
    async fn set_and_read_position() {
        let s = svc();
        let resp = s.set_position(1.23).await;
        assert!(resp.success);
        assert_eq!(s.read_position().await.angle, 1.23);
    }

    #[tokio::test]
    async fn set_and_read_velocity() {
        let s = svc();
        let resp = s.set_velocity(0.5).await;
        assert!(resp.success);
        assert_eq!(s.read_velocity().await.velocity, 0.5);
    }

    #[tokio::test]
    async fn set_and_read_torque() {
        let s = svc();
        let resp = s.set_torque(2.0).await;
        assert!(resp.success);
        // torque is stored; no dedicated read_torque yet — verify via state
        assert_eq!(resp.message, "Torque set");
    }

    #[tokio::test]
    async fn read_current_is_zero() {
        let s = svc();
        assert_eq!(s.read_current().await.current, 0.0);
    }

    #[tokio::test]
    async fn initial_position_is_zero() {
        let s = svc();
        assert_eq!(s.read_position().await.angle, 0.0);
    }
}
