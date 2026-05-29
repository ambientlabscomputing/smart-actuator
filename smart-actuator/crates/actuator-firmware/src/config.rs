// src/config.rs — firmware runtime configuration.
//
// Values are read from environment variables set at build time (via Cargo env,
// forwarded from .env by the Makefile). This approach avoids a filesystem read
// at boot and keeps the sdkconfig free of Wi-Fi credentials.
//
// All env vars have compile-time defaults so the firmware builds even without
// a .env file (useful in CI / Wokwi).

/// Resolved firmware configuration, read once at startup.
#[derive(Debug, Clone)]
pub struct FirmwareConfig {
    /// Unique actuator ID. Used as a log prefix and by the Sidecar as the
    /// `actuator_id` in its discovered-peer list.
    pub actuator_id: String,

    /// UART baud rate for the wire-protocol transport.
    /// Default: 921 600 bps.
    /// Wired on UART2: GPIO17 (TX) → adapter RX, GPIO16 (RX) → adapter TX.
    /// UART0 (GPIO1/GPIO3) is reserved for the ESP-IDF debug monitor.
    pub baud_rate: u32,

    /// WiFi SSID (kept for reference / future fallback; unused in USB-CDC mode).
    pub wifi_ssid: String,

    /// WiFi password (kept for reference; unused in USB-CDC mode).
    pub wifi_password: String,
}

impl FirmwareConfig {
    /// Read configuration from build-time env vars (set by .env / Makefile).
    ///
    /// Uses `option_env!` (compile-time) rather than `std::env::var` (runtime)
    /// because on bare-metal ESP-IDF there is no shell environment to read from
    /// — `std::env::var` always returns `Err`. The Makefile exports these vars
    /// before invoking cargo, and `build.rs` declares them via
    /// `cargo:rerun-if-env-changed` so editing `.env` triggers a rebuild.
    pub fn from_env() -> Self {
        Self {
            actuator_id: option_env!("ACTUATOR_ID").unwrap_or("bench-j0").to_string(),
            baud_rate: option_env!("ACTUATOR_BAUD_RATE")
                .and_then(|s| s.parse().ok())
                .unwrap_or(921_600u32),
            wifi_ssid: option_env!("WIFI_SSID").unwrap_or("").to_string(),
            wifi_password: option_env!("WIFI_PASSWORD").unwrap_or("").to_string(),
        }
    }
}
