//! Domain types shared between actuator-core and the gRPC adapter.
//! These are transport-independent — they carry no proto or tonic dependencies.

use thiserror::Error;

// ── Level 2 types ─────────────────────────────────────────────────────────────

/// Which controller the actuator runs.
/// Defaults to no restriction until `set_control_mode` is called.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ControlMode {
    /// Position control — PD controller targeting angle (radians).
    #[default]
    Position,
    /// Velocity control — P controller targeting rad/s.
    Velocity,
    /// Direct torque control — N·m feedforward.
    Torque,
    /// Impedance control — not yet implemented; commands are refused.
    Impedance,
}

/// Safety limits applied to every motion command.
/// Defaults are maximally permissive (no limits enforced).
#[derive(Debug, Clone)]
pub struct SafetyConfig {
    pub soft_limit_min: f64,     // rad — lower soft stop
    pub soft_limit_max: f64,     // rad — upper soft stop
    pub current_limit: f64,      // A   — max drive current (runtime enforcement)
    pub temperature_limit: f64,  // °C  — fault latches above this
}

impl Default for SafetyConfig {
    fn default() -> Self {
        Self {
            soft_limit_min: f64::NEG_INFINITY,
            soft_limit_max: f64::INFINITY,
            current_limit: f64::INFINITY,
            temperature_limit: f64::INFINITY,
        }
    }
}

/// Typed refusal reason returned when a command is rejected.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum RefusalReason {
    #[error("position outside soft limits")]
    OutsideSoftLimits,
    #[error("command not valid in the current control mode")]
    WrongControlMode,
    #[error("over-temperature fault — use ClearFault after cooling")]
    OverTemperature,
    #[error("fault latched — call ClearFault to reset")]
    FaultLatched,
    #[error("not implemented")]
    NotImplemented,
    #[error("trajectory currently running — pause or abort first")]
    TrajectoryRunning,
    #[error("trajectory segment is empty or has fewer than 2 points")]
    InvalidTrajectory,
}

// ── Level 3 types ─────────────────────────────────────────────────────────────

/// A single reference point within a trajectory segment.
#[derive(Debug, Clone)]
pub struct TrajectoryPoint {
    /// Seconds from the segment's `start_time_s`.
    pub time_s: f64,
    /// Reference position in radians.
    pub position: f64,
    /// Reference velocity in rad/s.
    pub velocity: f64,
    /// Feed-forward torque (N·m). `0.0` means unused.
    pub torque_ff: f64,
}

/// A sequence of reference points the trajectory executor tracks.
#[derive(Debug, Clone)]
pub struct TrajectorySegment {
    pub points: Vec<TrajectoryPoint>,
    /// Sim-monotonic time at which the segment starts (seconds).
    pub start_time_s: f64,
}

impl TrajectorySegment {
    /// Linearly interpolate position/velocity at `elapsed_s` seconds since
    /// segment start. Returns `None` once elapsed_s is past the final point.
    pub fn interpolate(&self, elapsed_s: f64) -> Option<TrajectoryPoint> {
        if self.points.is_empty() {
            return None;
        }
        let last = self.points.last().unwrap();
        if elapsed_s >= last.time_s {
            return None; // segment complete
        }
        let upper = self.points.iter().position(|p| p.time_s > elapsed_s)?;
        if upper == 0 {
            return Some(self.points[0].clone());
        }
        let lo = &self.points[upper - 1];
        let hi = &self.points[upper];
        let t = (elapsed_s - lo.time_s) / (hi.time_s - lo.time_s);
        Some(TrajectoryPoint {
            time_s: elapsed_s,
            position: lo.position + t * (hi.position - lo.position),
            velocity: lo.velocity + t * (hi.velocity - lo.velocity),
            torque_ff: lo.torque_ff + t * (hi.torque_ff - lo.torque_ff),
        })
    }
}

/// State of the trajectory executor state machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutorState {
    Idle,
    Running,
    Paused,
    Aborted,
}

/// Tracking error summary reported by `report_tracking_error`.
#[derive(Debug, Clone)]
pub struct TrackingErrorReport {
    pub instantaneous: f64,    // rad
    pub max_since_start: f64,  // rad
    pub rms: f64,              // rad
}

// ── Command / telemetry responses ─────────────────────────────────────────────

/// Response to a command (set_position, set_velocity, etc.).
#[derive(Debug, Clone)]
pub struct CommandResponse {
    pub success: bool,
    pub message: String,
    /// `None` when `success == true`.
    pub refusal: Option<RefusalReason>,
}

impl CommandResponse {
    pub fn ok(message: impl Into<String>) -> Self {
        Self { success: true, message: message.into(), refusal: None }
    }
    pub fn refused(reason: RefusalReason) -> Self {
        let message = reason.to_string();
        Self { success: false, message, refusal: Some(reason) }
    }
}

/// Current position in radians.
#[derive(Debug, Clone)]
pub struct PositionResponse {
    pub angle: f64,
}

/// Current velocity in rad/s.
#[derive(Debug, Clone)]
pub struct VelocityResponse {
    pub velocity: f64,
}

/// Current draw in amperes.
#[derive(Debug, Clone)]
pub struct CurrentResponse {
    pub current: f64,
}

/// Motor temperature in degrees Celsius.
#[derive(Debug, Clone)]
pub struct TemperatureResponse {
    pub temperature: f64,
}
