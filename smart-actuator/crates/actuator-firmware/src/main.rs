// src/main.rs — actuator-firmware entry point.
//
// PHASE 1: minimum viable firmware — LED heartbeat only. (DONE)
//
// PHASE 2 (done): WiFi + wire-framing ActuatorService. (replaced by Phase 3)
//
// PHASE 3 (current): USB-CDC / UART wire-framing ActuatorService.
//   - Communicates over UART0 (GPIO1=TX, GPIO3=RX) at 921 600 bps.
//   - Eliminates WiFi, mDNS, and TCP stack entirely.
//   - Magic sync-bytes (0xA5C3) in the wire protocol handle stale UART bytes
//     on power-on / reset without requiring a device-side reset sequence.
//
// PHASE 4+: 1 kHz PD control loop pinned to core 0 as a FreeRTOS task; the
// UART server stays on core 1.

mod config;
mod server;
mod hal;

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use actuator_core::AppService;
use esp_idf_svc::hal::{
    gpio::PinDriver,
    peripherals::Peripherals,
    uart::{UartDriver, config::Config},
    units::Hertz,
};

use config::FirmwareConfig;

/// GPIO pin for the onboard "heartbeat" LED (most DevKit v1 boards: GPIO 2).
#[allow(dead_code)]
const HEARTBEAT_LED_GPIO: i32 = 2;

fn main() -> Result<()> {
    // esp-idf-sys links the ESP-IDF entry point before main(). This call
    // patches any remaining std symbols needed by the Rust runtime.
    esp_idf_svc::sys::link_patches();

    // NOTE: no EspLogger init.  sdkconfig.defaults sets CONFIG_ESP_CONSOLE_NONE
    // so UART0 is free for the wire protocol.  All observability flows through
    // the wire protocol's status frames (visible via the Sidecar).

    // Register the ESP-IDF eventfd VFS driver. Without this, eventfd() returns
    // EACCES, which makes tokio's runtime builder fail with
    // "Permission denied (os error 13)" because mio's Waker is implemented
    // with eventfd on espidf.
    unsafe {
        let cfg = esp_idf_svc::sys::esp_vfs_eventfd_config_t { max_fds: 5 };
        esp_idf_svc::sys::esp!(esp_idf_svc::sys::esp_vfs_eventfd_register(&cfg))?;
    }

    let cfg = FirmwareConfig::from_env();

    // Take ownership of ESP32 peripherals. Can only be called once.
    let peripherals = Peripherals::take()?;

    // ── Heartbeat LED ────────────────────────────────────────────────────────
    // The only out-of-band liveness signal now that the console is silent.
    let mut led = PinDriver::output(peripherals.pins.gpio2)?;
    std::thread::Builder::new()
        .stack_size(4 * 1024)
        .name("heartbeat".into())
        .spawn(move || loop {
            let _ = led.set_high();
            std::thread::sleep(Duration::from_millis(250));
            let _ = led.set_low();
            std::thread::sleep(Duration::from_millis(250));
        })?;

    // ── UART0 (USB-CDC) — wire-protocol transport ────────────────────────────
    // The on-board USB-UART bridge (CP2102 / CH340 / FTDI on most DevKits) is
    // hard-wired to GPIO1 (TX) / GPIO3 (RX), so using UART0 means the same
    // USB cable that flashes the firmware also carries the wire protocol.
    //
    // This works because sdkconfig.defaults sets CONFIG_ESP_CONSOLE_NONE=y,
    // preventing the ESP-IDF VFS layer from claiming UART0 at boot.
    // All observability is moved into the wire protocol itself (status frames,
    // refusal codes, fault state) — printf debugging is no longer available.
    let uart_config = Config::new().baudrate(Hertz(cfg.baud_rate));
    let uart = UartDriver::new(
        peripherals.uart0,
        peripherals.pins.gpio1, // TX
        peripherals.pins.gpio3, // RX
        Option::<esp_idf_svc::hal::gpio::AnyIOPin>::None, // CTS (unused)
        Option::<esp_idf_svc::hal::gpio::AnyIOPin>::None, // RTS (unused)
        &uart_config,
    )?;

    // ── Wire-framing ActuatorService ─────────────────────────────────────────
    // Single-threaded tokio runtime: AppService uses tokio::sync::Mutex.
    // enable_io() is intentionally omitted — serve_uart uses synchronous reads
    // so there is no async IO; the IO driver would compete with UART0's
    // interrupt handler for no benefit.
    let hardware = hal::HalHardware::new();
    let service: Arc<dyn actuator_core::Service> = Arc::new(AppService::new(hardware));

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()?;

    // If serve_uart returns, the firmware can no longer talk to the host —
    // the LED heartbeat is the only liveness signal left.  Park the main task.
    let _ = rt.block_on(server::serve_uart(uart, service));
    loop {
        std::thread::sleep(Duration::from_secs(5));
    }
}
