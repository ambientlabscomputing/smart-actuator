use serde::Deserialize;
use std::env;

/// Resolved path to the config file.
/// Checks `ACTUATOR_SIM_CONFIG`, then falls back to `configs/default.yaml`.
pub fn config_path() -> String {
    env::var("ACTUATOR_SIM_CONFIG").unwrap_or_else(|_| "configs/default.yaml".into())
}

pub fn load(path: &str) -> anyhow::Result<ActuatorConfig> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("Cannot read config {path}: {e}"))?;
    let config: ActuatorConfig = serde_yaml::from_str(&text)
        .map_err(|e| anyhow::anyhow!("Cannot parse config {path}: {e}"))?;
    Ok(config)
}

#[derive(Debug, Deserialize)]
pub struct ActuatorConfig {
    #[serde(default)]
    pub log_settings: LogSettings,
    #[serde(default)]
    pub grpc: GrpcConfig,
    #[serde(default)]
    pub identity: IdentityConfig,
}

#[derive(Debug, Deserialize)]
pub struct LogSettings {
    #[serde(default = "LogSettings::default_file")]
    #[allow(dead_code)] // reserved for future file-based log appender
    pub file: String,
    #[serde(default = "LogSettings::default_level")]
    pub level: String,
    #[serde(default)]
    pub log_to_stderr: bool,
}

impl LogSettings {
    fn default_file() -> String { "actuator_sim.log".into() }
    fn default_level() -> String { "ERROR".into() }
}

impl Default for LogSettings {
    fn default() -> Self {
        Self {
            file: Self::default_file(),
            level: Self::default_level(),
            log_to_stderr: false,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct GrpcConfig {
    #[serde(default = "GrpcConfig::default_host")]
    pub host: String,
    #[serde(default = "GrpcConfig::default_port")]
    pub port: u16,
}

impl GrpcConfig {
    fn default_host() -> String { "0.0.0.0".into() }
    fn default_port() -> u16 { 50051 }
}

impl Default for GrpcConfig {
    fn default() -> Self {
        Self {
            host: Self::default_host(),
            port: Self::default_port(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct IdentityConfig {
    #[serde(default = "IdentityConfig::default_id")]
    pub id: String,
    #[serde(default = "IdentityConfig::default_name")]
    pub name: String,
}

impl IdentityConfig {
    fn default_id() -> String { "actuator-simulator-001".into() }
    fn default_name() -> String { "sim 1".into() }
}

impl Default for IdentityConfig {
    fn default() -> Self {
        Self {
            id: Self::default_id(),
            name: Self::default_name(),
        }
    }
}
