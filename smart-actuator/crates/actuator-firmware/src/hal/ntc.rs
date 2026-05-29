// src/hal/ntc.rs — NTC thermistor temperature sensor driver (optional).
//
// The NTC is clamp-mounted to the TMC2209 heat sink to detect driver
// over-temperature before the chip's internal protection triggers.
//
// Circuit: 10 kΩ NTC in a voltage divider with a 10 kΩ fixed resistor to
// 3.3 V. The ADC pin reads the midpoint voltage. Temperature is calculated
// using the Steinhart-Hart B-parameter equation.
//
// Phase 2 implementation checklist:
//   [ ] Configure ADC1 on GPIO 34 (input-only pin, 12-bit resolution).
//   [ ] read_adc_raw(): single-shot ADC read (0–4095).
//   [ ] Convert raw count → voltage → resistance → temperature using
//       Steinhart-Hart B-parameter equation.
//   [ ] Clamp at configurable threshold; propagate as fault via HalHardware.
//
// Wiring reference: see RFD-10 Electrical section.
//   Thermistor → GPIO 34 via voltage divider to 3V3.

/// Steinhart-Hart B-parameter equation constants for a typical 10 kΩ NTC.
/// B = 3950 K (common value; check your thermistor datasheet).
const B_PARAM: f64 = 3950.0;
/// Nominal resistance at 25 °C (Ω).
const R_NOMINAL: f64 = 10_000.0;
/// Nominal temperature for R_NOMINAL (K).
const T_NOMINAL_K: f64 = 298.15; // 25 °C

/// NTC thermistor driver.
///
/// Phase 1: returns 25.0 °C (ambient).
/// Phase 2: real ADC reads + Steinhart-Hart conversion.
pub struct Ntc {
    /// Fixed resistor in the voltage divider (Ω). Typically 10 kΩ.
    r_fixed: f64,
    // Phase 2: add ADC channel handle here.
}

impl Ntc {
    /// Read the raw 12-bit ADC count (0–4095).
    ///
    /// Phase 1: returns 2048 (midpoint → ~25 °C).
    /// Phase 2: ESP-IDF ADC oneshot read on GPIO 34.
    pub fn read_adc_raw(&self) -> u16 {
        2048 // TODO Phase 2
    }

    /// Convert a raw ADC count to resistance (Ω) using the voltage divider formula.
    fn count_to_resistance(&self, raw: u16) -> f64 {
        let v_ratio = raw as f64 / 4095.0;
        // NTC is between ADC and GND; fixed resistor is between 3V3 and ADC.
        self.r_fixed * v_ratio / (1.0 - v_ratio)
    }

    /// Read the temperature in degrees Celsius.
    ///
    /// Phase 1: returns 25.0.
    /// Phase 2: ADC → resistance → Steinhart-Hart → °C.
    pub fn read_temperature_c(&self) -> f64 {
        let raw = self.read_adc_raw();
        let r = self.count_to_resistance(raw);
        // Steinhart-Hart B-parameter form:
        //   1/T = 1/T0 + (1/B) * ln(R/R0)
        let t_inv = 1.0 / T_NOMINAL_K + (r / R_NOMINAL).ln() / B_PARAM;
        1.0 / t_inv - 273.15 // Kelvin → Celsius
    }
}

impl Default for Ntc {
    fn default() -> Self {
        Self { r_fixed: R_NOMINAL }
    }
}
