// examples/test_stepper.rs — TMC2209 open-loop stepper smoke test.
//
// Flashes as a standalone binary (no gRPC, no WiFi).
// Usage: make firmware-test-stepper
//
// Expected output: motor spins at a constant rate (0.5 rev/s), encoder
// reading follows. Confirms STEP/DIR/EN wiring and driver UART config.
// Bring-up checklist item 4 (see RFD-10).

use actuator_firmware::hal::{as5600::As5600, tmc2209::Tmc2209};
use esp_idf_svc::{hal::peripherals::Peripherals, log::EspLogger};
use log::info;
use std::time::Duration;

/// Open-loop test velocity: 0.5 revolutions per second = π rad/s.
const TEST_VELOCITY_RAD_S: f64 = std::f64::consts::PI;

fn main() -> anyhow::Result<()> {
    esp_idf_svc::sys::link_patches();
    EspLogger::initialize_default();

    info!("==> TMC2209 stepper open-loop smoke test");
    info!("    Target velocity: {:.2} rad/s ({:.2} rev/s)", TEST_VELOCITY_RAD_S, TEST_VELOCITY_RAD_S / std::f64::consts::TAU);
    info!("    Encoder angle should increase monotonically.");
    info!("    Ctrl-C (reset button) to stop.");

    let _peripherals = Peripherals::take()?;

    let mut stepper = Tmc2209::default();
    let mut encoder = As5600::default();

    stepper.enable();
    stepper.set_velocity_rad_s(TEST_VELOCITY_RAD_S);

    loop {
        let angle = encoder.read_angle_rad();
        let fault = stepper.read_fault();
        info!("angle = {:.4} rad  fault = {}", angle, fault);
        if fault {
            log::error!("Driver fault detected! Check wiring and TMC2209 DIAG pin.");
            stepper.disable();
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    Ok(())
}
