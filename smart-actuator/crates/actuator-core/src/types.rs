/// Domain types shared between actuator-core and the gRPC adapter.
/// These are transport-independent — they carry no proto or tonic dependencies.

/// Response to a command (set_position, set_velocity, set_torque).
#[derive(Debug, Clone)]
pub struct CommandResponse {
    pub success: bool,
    pub message: String,
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
