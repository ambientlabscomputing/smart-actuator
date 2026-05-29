// examples/test_temp.rs — NTC thermistor temperature sensor smoke test.
//
// Flashes as a standalone binary (no gRPC, no WiFi).
// Usage: make firmware-test-temp
//
// Expected output: temperature reading near ambient (~20–25 °C).
// Touch the stepper driver IC or heat it briefly — reading should rise.
// Optional peripheral; skip if NTC is not wired (make firmware-test-hal
// handles this with `|| true`).

use actuator_firmware::hal::ntc::Ntc;
use esp_idf_svc::{hal::peripherals::Peripherals, log::EspLogger};
use log::info;
use std::time::Duration;

fn main() -> anyhow::Result<()> {
    esp_idf_svc::sys::link_patches();
    EspLogger::initialize_default();

    info!("==> NTC thermistor smoke test");
    info!("    Expect reading near ambient (~20–25 °C).");
    info!("    Touch or gently warm the stepper driver IC to confirm response.");

    let _peripherals = Peripherals::take()?;

    // Phase 2: pass ADC channel handle into Ntc::new(adc).
    let sensor = Ntc::default();

    loop {
        let temp = sensor.read_temperature_c();
        info!("temperature = {:.1} °C", temp);
        std::thread::sleep(Duration::from_millis(500));
    }
}
