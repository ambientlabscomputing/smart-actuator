// examples/test_encoder.rs — AS5600 encoder smoke test.
//
// Flashes as a standalone binary (no gRPC, no WiFi).
// Usage: make firmware-test-encoder
//
// Expected output: angle reading in the serial monitor sweeping monotonically
// as you rotate the shaft by hand. One full revolution = 2π radians.
// Bring-up checklist item 3 (see RFD-10).

use actuator_firmware::hal::as5600::As5600;
use esp_idf_svc::{hal::peripherals::Peripherals, log::EspLogger};
use log::info;
use std::time::Duration;

fn main() -> anyhow::Result<()> {
    esp_idf_svc::sys::link_patches();
    EspLogger::initialize_default();

    info!("==> AS5600 encoder smoke test");
    info!("    Rotate the shaft by hand.");
    info!("    Expect angle to sweep monotonically over ±π rad.");
    info!("    Full clockwise revolution = +2π rad.");

    let _peripherals = Peripherals::take()?;

    // Phase 2: pass I²C handle into As5600::new(i2c).
    // Phase 1: stub reads return 0.0.
    let mut encoder = As5600::default();

    loop {
        let angle = encoder.read_angle_rad();
        info!("angle = {:.4} rad  ({:.2} °)", angle, angle.to_degrees());
        std::thread::sleep(Duration::from_millis(100));
    }
}
