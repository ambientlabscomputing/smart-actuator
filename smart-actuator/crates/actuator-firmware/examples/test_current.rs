// examples/test_current.rs — INA219 current sensor smoke test.
//
// Flashes as a standalone binary (no gRPC, no WiFi).
// Usage: make firmware-test-current
//
// Expected output: bus voltage ~12 V, current ~0 A at rest.
// Stall the motor shaft by hand — current should spike to 0.5–2 A
// depending on the TMC2209's IRUN setting.
// Bring-up checklist (see RFD-10).

use actuator_firmware::hal::ina219::Ina219;
use esp_idf_svc::{hal::peripherals::Peripherals, log::EspLogger};
use log::info;
use std::time::Duration;

fn main() -> anyhow::Result<()> {
    esp_idf_svc::sys::link_patches();
    EspLogger::initialize_default();

    info!("==> INA219 current sensor smoke test");
    info!("    At rest: expect ~12 V bus, ~0 A current.");
    info!("    Stall the motor shaft to see a current spike.");

    let _peripherals = Peripherals::take()?;

    // Phase 2: pass shared I²C handle into Ina219::new(i2c).
    let mut sensor = Ina219::default();

    loop {
        let voltage = sensor.read_bus_voltage_v();
        let current = sensor.read_current_a();
        info!("bus = {:.2} V  current = {:.3} A", voltage, current);
        std::thread::sleep(Duration::from_millis(50)); // ~20 Hz
    }
}
