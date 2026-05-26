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
    #[serde(default)]
    pub physics: PhysicsConfig,
    /// Path to the PID file written on startup and removed on clean shutdown.
    #[serde(default = "ActuatorConfig::default_pid_file")]
    pub pid_file: String,
}

impl ActuatorConfig {
    fn default_pid_file() -> String { "actuator_sim.pid".into() }
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
    #[serde(default = "GrpcConfig::default_backdoor_port")]
    pub backdoor_port: u16,
    #[serde(default = "GrpcConfig::default_enable_backdoor")]
    pub enable_backdoor: bool,
}

impl GrpcConfig {
    fn default_host() -> String { "0.0.0.0".into() }
    fn default_port() -> u16 { 50051 }
    fn default_backdoor_port() -> u16 { 50052 }
    fn default_enable_backdoor() -> bool { true }
}

impl Default for GrpcConfig {
    fn default() -> Self {
        Self {
            host: Self::default_host(),
            port: Self::default_port(),
            backdoor_port: Self::default_backdoor_port(),
            enable_backdoor: Self::default_enable_backdoor(),
        }
    }
}

/// Physics and control parameters for the sim plant.
#[derive(Debug, Deserialize)]
pub struct PhysicsConfig {
    /// Physics integration rate (Hz)
    #[serde(default = "PhysicsConfig::default_tick_hz")]
    pub tick_hz: f64,
    /// Rotational inertia J (kg·m²)
    #[serde(default = "PhysicsConfig::default_inertia")]
    pub inertia: f64,
    /// Viscous damping b (N·m·s/rad)
    #[serde(default = "PhysicsConfig::default_damping")]
    pub damping: f64,
    /// Position-mode PD Kp (N·m/rad)
    #[serde(default = "PhysicsConfig::default_kp_pos")]
    pub kp_pos: f64,
    /// Position-mode PD Kd (N·m·s/rad)
    #[serde(default = "PhysicsConfig::default_kd_pos")]
    pub kd_pos: f64,
    /// Velocity-mode P Kp (N·m·s/rad)
    #[serde(default = "PhysicsConfig::default_kp_vel")]
    pub kp_vel: f64,
    /// Torque constant A/N·m (for current estimation)
    #[serde(default = "PhysicsConfig::default_kt")]
    pub kt: f64,
    /// Encoder noise std dev (rad). 0.0 = noiseless.
    #[serde(default)]
    pub encoder_noise_std: f64,
    /// Thermal resistance R_th (°C/W)
    #[serde(default = "PhysicsConfig::default_thermal_resistance")]
    pub thermal_resistance: f64,
    /// Thermal capacitance C_th (J/°C)
    #[serde(default = "PhysicsConfig::default_thermal_capacitance")]
    pub thermal_capacitance: f64,
}

impl PhysicsConfig {
    fn default_tick_hz() -> f64 { 1_000.0 }
    fn default_inertia() -> f64 { 0.01 }
    fn default_damping() -> f64 { 0.1 }
    fn default_kp_pos() -> f64 { 10.0 }
    fn default_kd_pos() -> f64 { 2.0 }
    fn default_kp_vel() -> f64 { 1.0 }
    fn default_kt() -> f64 { 2.0 }
    fn default_thermal_resistance() -> f64 { 5.0 }
    fn default_thermal_capacitance() -> f64 { 10.0 }
}

impl Default for PhysicsConfig {
    fn default() -> Self {
        Self {
            tick_hz: Self::default_tick_hz(),
            inertia: Self::default_inertia(),
            damping: Self::default_damping(),
            kp_pos: Self::default_kp_pos(),
            kd_pos: Self::default_kd_pos(),
            kp_vel: Self::default_kp_vel(),
            kt: Self::default_kt(),
            encoder_noise_std: 0.0,
            thermal_resistance: Self::default_thermal_resistance(),
            thermal_capacitance: Self::default_thermal_capacitance(),
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
