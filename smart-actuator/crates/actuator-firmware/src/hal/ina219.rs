// src/hal/ina219.rs — INA219 high-side current/power monitor driver.
//
// Interface: I²C, address 0x40 (A0=GND, A1=GND).
// Measures: bus voltage (V) and shunt current (A) on the 12 V motor rail.
//
// IMPORTANT — wiring note from RFD-10:
//   The INA219 must sit on the HIGH side of the motor rail (between the PSU
//   and the TMC2209's VM pin), NOT between the driver and motor windings.
//   Measuring chopped current (driver → motor) aliases the INA219's sampling.
//
// Phase 2 implementation checklist:
//   [ ] Obtain shared I²C handle (same bus as AS5600, different address).
//   [ ] At boot: write Configuration register to set gain, range, and sample
//       averaging (16-sample average → ~100 Hz effective sample rate).
//   [ ] read_current_a(): read Shunt Voltage register (0x01), divide by
//       shunt resistance (0.1 Ω on most breakout boards → multiply by 10).
//   [ ] read_bus_voltage_v(): read Bus Voltage register (0x02), shift right
//       3, multiply by 4 mV LSB.
//
// Wiring reference: see RFD-10 Electrical section.
//   SDA → GPIO 21, SCL → GPIO 22 (shared with AS5600). Address 0x40.

/// INA219 current/power monitor driver.
///
/// Phase 1: all reads return 0.0.
/// Phase 2: real I²C reads.
pub struct Ina219 {
    /// Shunt resistance in ohms. Typical breakout: 0.1 Ω.
    shunt_ohms: f64,
    // Phase 2: add I²C master handle here.
}

impl Ina219 {
    pub const I2C_ADDR: u8 = 0x40;

    /// Read the motor rail current (amperes).
    ///
    /// Phase 1: returns 0.0.
    /// Phase 2: read Shunt Voltage register, divide by shunt resistance.
    pub fn read_current_a(&mut self) -> f64 {
        0.0 // TODO Phase 2
    }

    /// Read the motor rail bus voltage (volts).
    ///
    /// Phase 1: returns 12.0 (nominal bench supply voltage).
    /// Phase 2: read Bus Voltage register.
    pub fn read_bus_voltage_v(&mut self) -> f64 {
        12.0 // TODO Phase 2
    }
}

impl Default for Ina219 {
    fn default() -> Self {
        Self { shunt_ohms: 0.1 }
    }
}
