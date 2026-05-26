use serde::Deserialize;
use std::env;

pub fn config_path() -> String {
    env::var("SIDECAR_CONFIG").unwrap_or_else(|_| "configs/default.yaml".into())
}

pub fn load(path: &str) -> anyhow::Result<SidecarConfig> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("Cannot read config {path}: {e}"))?;
    let config: SidecarConfig = serde_yaml::from_str(&text)
        .map_err(|e| anyhow::anyhow!("Cannot parse config {path}: {e}"))?;
    Ok(config)
}

#[derive(Debug, Deserialize)]
pub struct SidecarConfig {
    #[serde(default)]
    pub log_settings: LogSettings,
    /// The socket the Sidecar exposes to the Brain (gRPC).
    /// Use a Unix socket path (e.g. /tmp/sidecar.sock) or TCP host:port.
    #[serde(default)]
    pub listen: ListenConfig,
    #[serde(default)]
    pub watchdog: WatchdogConfig,
    #[serde(default)]
    pub discovery: DiscoveryConfig,
    #[serde(default = "SidecarConfig::default_pid_file")]
    pub pid_file: String,
}

impl SidecarConfig {
    fn default_pid_file() -> String {
        "sidecar.pid".into()
    }
}

#[derive(Debug, Deserialize)]
pub struct LogSettings {
    #[serde(default = "LogSettings::default_file")]
    pub file: String,
    #[serde(default = "LogSettings::default_level")]
    pub level: String,
    #[serde(default)]
    pub log_to_stderr: bool,
}

impl LogSettings {
    fn default_file() -> String {
        "sidecar.log".into()
    }
    fn default_level() -> String {
        "INFO".into()
    }
}

impl Default for LogSettings {
    fn default() -> Self {
        Self {
            file: Self::default_file(),
            level: Self::default_level(),
            log_to_stderr: true,
        }
    }
}

/// Where the Sidecar listens for Brain connections.
/// In production this should be a Unix socket; TCP is supported for dev/test.
#[derive(Debug, Deserialize)]
pub struct ListenConfig {
    /// Unix socket path, e.g. "/tmp/sidecar.sock".
    /// If set, takes precedence over host:port.
    #[serde(default)]
    pub socket_path: Option<String>,
    #[serde(default = "ListenConfig::default_host")]
    pub host: String,
    #[serde(default = "ListenConfig::default_port")]
    pub port: u16,
}

impl ListenConfig {
    fn default_host() -> String {
        "127.0.0.1".into()
    }
    fn default_port() -> u16 {
        50060
    }
}

impl Default for ListenConfig {
    fn default() -> Self {
        Self {
            socket_path: Some("/tmp/sidecar.sock".into()),
            host: Self::default_host(),
            port: Self::default_port(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct WatchdogConfig {
    /// Seconds without a Brain heartbeat before the watchdog triggers an E-stop.
    #[serde(default = "WatchdogConfig::default_timeout_secs")]
    pub timeout_secs: u64,
    /// Seconds between watchdog check iterations.
    #[serde(default = "WatchdogConfig::default_check_interval_secs")]
    pub check_interval_secs: u64,
    /// If false, the watchdog logs a warning but does not actually E-stop.
    /// Useful during development.
    #[serde(default = "WatchdogConfig::default_enabled")]
    pub enabled: bool,
}

impl WatchdogConfig {
    fn default_timeout_secs() -> u64 {
        5
    }
    fn default_check_interval_secs() -> u64 {
        1
    }
    fn default_enabled() -> bool {
        true
    }
}

impl Default for WatchdogConfig {
    fn default() -> Self {
        Self {
            timeout_secs: Self::default_timeout_secs(),
            check_interval_secs: Self::default_check_interval_secs(),
            enabled: Self::default_enabled(),
        }
    }
}

/// How the Sidecar discovers the actuators it manages.
#[derive(Debug, Deserialize, Default)]
pub struct DiscoveryConfig {
    /// Static list of actuator endpoints. Discovery mode defaults to this.
    #[serde(default)]
    pub static_actuators: Vec<ActuatorEndpointConfig>,
    // TODO: add mDNS / USB enumeration options
}

/// A single statically configured actuator endpoint.
#[derive(Debug, Deserialize, Clone)]
pub struct ActuatorEndpointConfig {
    pub id: String,
    /// gRPC address, e.g. "http://127.0.0.1:50051"
    pub address: String,
    /// The joint name this actuator is bound to.
    pub joint_name: String,
    #[serde(default)]
    pub is_simulated: bool,
}
