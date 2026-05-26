// Stub HAL Hardware implementation.
// Real encoder reads, ADC current sense, and PWM driver calls go here.

use std::sync::Arc;

use actuator_core::{hardware::Hardware, types::ControlMode};

/// Hardware Abstraction Layer implementation for real firmware.
/// Implements the `Hardware` seam that `actuator-core`'s `AppService` depends on.
/// Swap in real HAL calls once drivers are available.
#[derive(Default)]
pub struct HalHardware {
    // TODO: add HAL state (encoder handle, ADC handle, PWM channel, etc.)
}

impl HalHardware {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {})
    }
}

#[async_trait::async_trait]
impl Hardware for HalHardware {
    async fn read_position_raw(&self) -> f64 {
        0.0 // TODO: read encoder
    }
    async fn read_velocity_raw(&self) -> f64 {
        0.0 // TODO: differentiate encoder or read velocity observer
    }
    async fn read_current(&self) -> f64 {
        0.0 // TODO: ADC current sense
    }
    async fn read_temperature(&self) -> f64 {
        25.0 // TODO: NTC thermistor read
    }
    async fn apply_motor_command(&self, _mode: ControlMode, _setpoint: f64) {
        // TODO: HAL driver integration — PWM, current loop, etc.
    }
    // sim_time_s uses the default 0.0 impl (real hardware has no sim clock)
}
