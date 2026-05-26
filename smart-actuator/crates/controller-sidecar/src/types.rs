//! Transport-independent domain types for the Sidecar.

use std::time::Instant;

/// Identifies a single actuator the Sidecar manages.
#[derive(Debug, Clone)]
pub struct ActuatorEndpoint {
    pub id: String,
    /// gRPC address, e.g. "http://127.0.0.1:50051"
    pub address: String,
    pub joint_name: String,
    pub is_simulated: bool,
}

/// A single actuator's joint state at a point in time.
#[derive(Debug, Clone)]
pub struct JointStateSnapshot {
    pub actuator_id: String,
    pub joint_name: String,
    pub angle_rad: f64,
    pub velocity_rad_s: f64,
    pub current_a: f64,
    /// Non-empty when the actuator has a latched fault.
    pub fault: Option<String>,
    pub captured_at: Instant,
}

/// Health of a connected actuator as seen by the Sidecar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActuatorHealth {
    Ok,
    Degraded,
    Fault,
    Unknown,
}

impl ActuatorHealth {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Degraded => "degraded",
            Self::Fault => "fault",
            Self::Unknown => "unknown",
        }
    }
}
