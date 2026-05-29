// src/hal/as5600.rs — AS5600 12-bit absolute magnetic rotary encoder driver.
//
// Interface: I²C, address 0x36 (fixed, no address pins).
// Resolution: 12-bit (4096 counts / revolution).
// Output: raw count → angle in radians.
//
// Phase 2 implementation checklist:
//   [ ] Obtain I²C master handle from main (passed in via As5600::new).
//   [ ] Implement read_raw_angle(): read 2-byte register 0x0C (RAW_ANGLE H+L).
//   [ ] Apply zero offset (stored in NVS by calibration service).
//   [ ] Apply direction sign (also stored in NVS).
//   [ ] Cache last reading for velocity differentiation.
//
// Wiring reference: see RFD-10 Electrical section.
//   SDA → GPIO 21, SCL → GPIO 22, I²C at 400 kHz.
//   Magnet: diametric, glued to shaft end, centered on axis, 1–3 mm from IC.

/// AS5600 encoder driver.
///
/// Phase 1: all methods return constants.
/// Phase 2: real I²C reads.
pub struct As5600 {
    /// Zero offset (counts) set during calibration and persisted to NVS.
    zero_offset: u16,
    /// Sign convention: +1.0 or -1.0. Set during calibration.
    direction: f64,
    // Phase 2: add I²C master handle here.
    // i2c: esp_idf_hal::i2c::I2cDriver<'static>,
}

impl As5600 {
    pub const I2C_ADDR: u8 = 0x36;

    /// Read the raw 12-bit angle count (0–4095).
    ///
    /// Phase 1: returns a constant 0.
    /// Phase 2: read registers 0x0C (high byte) and 0x0D (low byte) via I²C,
    ///          combine into a u16, mask to 12 bits.
    pub fn read_raw_angle(&mut self) -> u16 {
        0 // TODO Phase 2
    }

    /// Read the calibrated angle in radians, applying zero offset and direction.
    pub fn read_angle_rad(&mut self) -> f64 {
        let raw = self.read_raw_angle();
        let counts = (raw.wrapping_sub(self.zero_offset)) & 0x0FFF;
        self.direction * (counts as f64) * std::f64::consts::TAU / 4096.0
    }

    /// Set the zero offset to the current raw reading and persist to NVS.
    ///
    /// Called by the calibration service when the user issues `set_home`.
    pub fn set_home(&mut self) {
        self.zero_offset = self.read_raw_angle();
        // TODO Phase 3: persist to NVS via esp-idf-svc::nvs
    }

    /// Flip the direction sign and persist to NVS.
    ///
    /// Called by the calibration service when a positive command produces a
    /// negative encoder delta.
    pub fn flip_direction(&mut self) {
        self.direction = -self.direction;
        // TODO Phase 3: persist to NVS
    }
}

impl Default for As5600 {
    fn default() -> Self {
        Self { zero_offset: 0, direction: 1.0 }
    }
}
