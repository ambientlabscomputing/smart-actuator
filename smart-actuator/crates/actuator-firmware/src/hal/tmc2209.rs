// src/hal/tmc2209.rs — TMC2209 stepper driver interface.
//
// The TMC2209 is controlled via two mechanisms:
//   1. STEP/DIR/EN GPIO signals — motion commands (step pulse train).
//   2. UART (single-wire) — configuration (current, microstepping, DIAG).
//
// Step generation uses the ESP32's RMT (Remote Control) peripheral for
// jitter-free pulse trains independent of task scheduling.
//
// Phase 2 implementation checklist:
//   [ ] Configure UART for single-wire half-duplex (GPIO 16/17, 115200 baud).
//   [ ] Write IRUN / IHOLD registers at boot (set from capability descriptor).
//   [ ] Initialise RMT peripheral on the STEP pin (GPIO 25).
//   [ ] set_step_rate(): encode target steps/sec as RMT symbol period.
//   [ ] Poll GSTAT / DIAG for stall / over-temperature faults.
//   [ ] EN pin (GPIO 27): deassert (HIGH) on E-stop; assert (LOW) to enable.
//
// Wiring reference: see RFD-10 Electrical section, signal table.
//   STEP → GPIO 25, DIR → GPIO 26, EN → GPIO 27 (active-low).
//   UART TX → GPIO 17, UART RX ← GPIO 16.

/// Steps per revolution for the NEMA 17 at the configured microstepping.
/// 200 full steps × 8 microsteps = 1600 steps/rev.
pub const STEPS_PER_REV: u32 = 1600;

/// TMC2209 stepper driver controller.
///
/// Phase 1: all methods are no-ops.
/// Phase 2: real RMT + UART calls.
pub struct Tmc2209 {
    /// Current commanded step rate (steps / second). Positive = forward.
    step_rate: i32,
    /// Whether the driver is enabled (EN pin asserted).
    enabled: bool,
    // Phase 2: add RMT channel handle, UART handle, GPIO pins.
}

impl Tmc2209 {
    /// Enable the stepper driver (assert EN pin LOW).
    ///
    /// Phase 2: drive GPIO 27 LOW.
    pub fn enable(&mut self) {
        self.enabled = true;
        // TODO Phase 2: gpio_en.set_low()
    }

    /// Disable the stepper driver (deassert EN pin HIGH).
    ///
    /// Called immediately on E-stop or fault. Must complete within one
    /// control tick (<1 ms).
    ///
    /// Phase 2: drive GPIO 27 HIGH.
    pub fn disable(&mut self) {
        self.enabled = false;
        self.step_rate = 0;
        // TODO Phase 2: gpio_en.set_high()
    }

    /// Set the commanded step rate (steps / second). Sign encodes direction.
    ///
    /// Phase 2:
    ///   - Set DIR pin (GPIO 26) based on sign.
    ///   - Program RMT carrier period = 1_000_000 / abs(step_rate) µs.
    ///   - Zero step_rate → stop RMT output.
    pub fn set_step_rate(&mut self, steps_per_sec: i32) {
        if !self.enabled {
            return;
        }
        self.step_rate = steps_per_sec;
        // TODO Phase 2: gpio_dir.set_level(steps_per_sec >= 0)
        // TODO Phase 2: rmt_channel.set_carrier_period(...)
    }

    /// Convert a target velocity (rad/s) to steps/sec and command the driver.
    pub fn set_velocity_rad_s(&mut self, rad_s: f64) {
        let steps = (rad_s * STEPS_PER_REV as f64 / std::f64::consts::TAU) as i32;
        self.set_step_rate(steps);
    }

    /// Read the DIAG fault flag from the TMC2209 via UART.
    ///
    /// Phase 1: returns false (no fault).
    /// Phase 2: read GSTAT register byte 0 bit 1 (over-temperature) or bit 2
    ///          (short circuit).
    pub fn read_fault(&self) -> bool {
        false // TODO Phase 2
    }
}

impl Default for Tmc2209 {
    fn default() -> Self {
        Self { step_rate: 0, enabled: false }
    }
}
