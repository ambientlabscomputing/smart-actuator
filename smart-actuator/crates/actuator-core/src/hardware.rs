use crate::types::ControlMode;

/// Hardware I/O seam — the interface between control logic and physical (or
/// simulated) drivers.
///
/// Real firmware implements this with HAL calls (encoder, ADC, PWM driver).
/// The simulator implements it with `SimPlant` (dynamics model).
///
/// `actuator-core` depends ONLY on this trait — it never sees hardware or
/// simulation details, which is what keeps the shared control code honest.
#[async_trait::async_trait]
pub trait Hardware: Send + Sync {
    /// Read joint position from the encoder (radians). May include sensor
    /// noise in simulation.
    async fn read_position_raw(&self) -> f64;

    /// Read joint velocity (rad/s).
    async fn read_velocity_raw(&self) -> f64;

    /// Read motor phase current draw (amperes).
    async fn read_current(&self) -> f64;

    /// Read motor temperature (°C).
    async fn read_temperature(&self) -> f64;

    /// Command the motor driver.
    /// - `mode`     — which controller to run
    /// - `setpoint` — position (rad), velocity (rad/s), or torque (N·m)
    async fn apply_motor_command(&self, mode: ControlMode, setpoint: f64);

    /// Sim-monotonic time in seconds. Real hardware returns `0.0`.
    async fn sim_time_s(&self) -> f64 {
        0.0
    }
}
