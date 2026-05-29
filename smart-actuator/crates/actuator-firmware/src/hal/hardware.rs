// src/hal/hardware.rs — HalHardware: the actuator_core::Hardware implementation.
//
// This is the seam between actuator-core's control logic and the physical
// drivers. actuator-core never imports esp-idf-hal or any peripheral crate
// directly — it only calls these async methods.
//
// Phase 1: stub implementations (return constants / 0.0).
// Phase 2: replace each method body with a real driver call from the
//          sibling modules (as5600, tmc2209, ina219, ntc).

use std::sync::Arc;

use actuator_core::{hardware::Hardware, types::ControlMode};

/// Hardware Abstraction Layer implementation for the ESP32 testbench.
///
/// Owns handles to each peripheral driver. All fields are `Option<_>` so the
/// struct can be constructed without hardware present (Phase 1 / Wokwi), and
/// real drivers are plugged in incrementally as Phase 2 progresses.
pub struct HalHardware {
    // Phase 2: replace these with real driver handles.
    // encoder: Option<super::as5600::As5600>,
    // stepper: Option<super::tmc2209::Tmc2209>,
    // current: Option<super::ina219::Ina219>,
    // temp:    Option<super::ntc::Ntc>,
}

impl HalHardware {
    /// Construct with all drivers in stub mode (Phase 1 default).
    pub fn new() -> Arc<Self> {
        Arc::new(Self {})
    }
}

#[async_trait::async_trait]
impl Hardware for HalHardware {
    /// Read joint position from the AS5600 absolute magnetic encoder (radians).
    ///
    /// Phase 1: returns 0.0.
    /// Phase 2: `self.encoder.as_ref()?.read_angle_rad()` via I²C.
    async fn read_position_raw(&self) -> f64 {
        0.0
    }

    /// Read joint velocity (rad/s).
    ///
    /// Phase 1: returns 0.0.
    /// Phase 2: differentiate successive AS5600 readings over the loop period.
    async fn read_velocity_raw(&self) -> f64 {
        0.0
    }

    /// Read motor phase current from the INA219 (amperes, high-side).
    ///
    /// Phase 1: returns 0.0.
    /// Phase 2: `self.current.as_ref()?.read_current_a()` via I²C.
    async fn read_current(&self) -> f64 {
        0.0
    }

    /// Read motor/driver temperature from the NTC thermistor (°C).
    ///
    /// Phase 1: returns 25.0 (ambient).
    /// Phase 2: ADC read → Steinhart-Hart → °C.
    async fn read_temperature(&self) -> f64 {
        25.0
    }

    /// Command the TMC2209 stepper driver.
    ///
    /// `mode` is the active control mode (Position / Velocity / Torque).
    /// `setpoint` is the target value in the mode's native unit
    ///   (rad, rad/s, or N·m respectively).
    ///
    /// Phase 1: no-op.
    /// Phase 2: convert setpoint → step rate → RMT pulse train via
    ///          `self.stepper.as_ref()?.set_step_rate(steps_per_sec)`.
    async fn apply_motor_command(&self, _mode: ControlMode, _setpoint: f64) {
        // no-op until Phase 2
    }

    // sim_time_s is left at the default 0.0 — real hardware has no sim clock.
}
