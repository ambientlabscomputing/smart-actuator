use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tracing::trace;

use actuator_core::{hardware::Hardware, types::ControlMode};

// ── Plant parameters ──────────────────────────────────────────────────────────

/// Physical and control parameters for the sim plant.
/// Loaded from config; defaults give a reasonable small servo/joint.
#[derive(Debug, Clone)]
pub struct PlantParams {
    /// Rotational inertia J (kg·m²)
    pub inertia: f64,
    /// Viscous damping b (N·m·s/rad)
    pub damping: f64,
    /// Encoder noise standard deviation (rad). 0.0 = noiseless.
    #[allow(dead_code)]
    pub encoder_noise_std: f64,
    /// Position-mode PD Kp (N·m/rad)
    pub kp_pos: f64,
    /// Position-mode PD Kd (N·m·s/rad)
    pub kd_pos: f64,
    /// Velocity-mode P Kp (N·m·s/rad)
    pub kp_vel: f64,
    /// Torque constant: A / (N·m) — for current estimation
    pub kt: f64,
    /// Thermal resistance R_th (°C/W)
    pub thermal_resistance: f64,
    /// Thermal capacitance C_th (J/°C)
    pub thermal_capacitance: f64,
}

impl Default for PlantParams {
    fn default() -> Self {
        Self {
            inertia: 0.01,
            damping: 0.1,
            encoder_noise_std: 0.0,
            kp_pos: 10.0,
            kd_pos: 2.0,
            kp_vel: 1.0,
            kt: 2.0,
            thermal_resistance: 5.0,
            thermal_capacitance: 10.0,
        }
    }
}

// ── Plant truth (exposed to backdoor) ────────────────────────────────────────

pub struct PlantTruth {
    pub position: f64,
    pub velocity: f64,
    pub current: f64,
    pub temperature: f64,
    pub sim_time_s: f64,
}

// ── Fault injection kinds ─────────────────────────────────────────────────────

pub enum SimFaultKind {
    OverTemperature,
    OverCurrent,
    EncoderStuck,
}

// ── Internal state ────────────────────────────────────────────────────────────

struct PlantState {
    position: f64,           // rad
    velocity: f64,           // rad/s
    current: f64,            // A
    temperature: f64,        // °C
    ambient_temperature: f64, // °C
    commanded_mode: ControlMode,
    commanded_setpoint: f64,
    external_torque: f64,    // N·m (set by backdoor)
    external_torque_ticks: u64, // ticks remaining; u64::MAX = indefinite
    sim_time_s: f64,
    paused: bool,
}

impl Default for PlantState {
    fn default() -> Self {
        Self {
            position: 0.0,
            velocity: 0.0,
            current: 0.0,
            temperature: 25.0,
            ambient_temperature: 25.0,
            commanded_mode: ControlMode::Position,
            commanded_setpoint: 0.0,
            external_torque: 0.0,
            external_torque_ticks: 0,
            sim_time_s: 0.0,
            paused: false,
        }
    }
}

// ── SimPlant ──────────────────────────────────────────────────────────────────

/// First-order dynamics model used by the simulator.
///
/// Implements `Hardware` so that `AppService` can use it as its I/O layer.
/// Also exposes sim-specific methods (tick, backdoor access) that are never
/// visible through the `Hardware` trait — keeping the seam clean.
pub struct SimPlant {
    state: Mutex<PlantState>,
    params: PlantParams,
}

impl SimPlant {
    pub fn new(params: PlantParams) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(PlantState::default()),
            params,
        })
    }

    /// Advance physics by `dt` seconds.
    /// Called by the tick task in `main.rs` AFTER `AppService::tick` has
    /// applied the latest setpoint via `apply_motor_command`.
    pub async fn tick(&self, dt: f64) {
        let mut s = self.state.lock().await;
        if s.paused {
            return;
        }
        let p = &self.params;

        // Controller torque from commanded mode/setpoint
        let motor_torque = match s.commanded_mode {
            ControlMode::Position => {
                let err = s.commanded_setpoint - s.position;
                p.kp_pos * err - p.kd_pos * s.velocity
            }
            ControlMode::Velocity => {
                let err = s.commanded_setpoint - s.velocity;
                p.kp_vel * err
            }
            ControlMode::Torque => s.commanded_setpoint,
            ControlMode::Impedance => 0.0, // not implemented
        };

        // External disturbance torque (injected by backdoor)
        let ext = if s.external_torque_ticks > 0 {
            s.external_torque_ticks -= 1;
            if s.external_torque_ticks == 0 {
                let t = s.external_torque;
                s.external_torque = 0.0;
                t
            } else {
                s.external_torque
            }
        } else {
            s.external_torque // 0.0 unless set to indefinite (u64::MAX ticks)
        };

        let total_torque = motor_torque + ext;

        // Euler integration: θ̈ = (τ_total − b·θ̇) / J
        let angular_acc = (total_torque - p.damping * s.velocity) / p.inertia;
        s.velocity += angular_acc * dt;
        s.position += s.velocity * dt;

        // Current estimate: I = |τ_motor| * kt
        s.current = (motor_torque.abs() * p.kt).min(1_000.0);

        // Thermal model: first-order RC
        //   P_loss ≈ I² / kt  (rough: kt [A/Nm] → P_loss [W])
        let power = s.current * s.current / p.kt;
        s.temperature += (power / p.thermal_capacitance
            - (s.temperature - s.ambient_temperature)
                / (p.thermal_resistance * p.thermal_capacitance))
            * dt;

        s.sim_time_s += dt;

        trace!(
            pos = s.position,
            vel = s.velocity,
            current = s.current,
            temp = s.temperature,
            sim_time = s.sim_time_s,
            "plant tick"
        );
    }

    // ── Backdoor access (called from backdoor.rs only) ────────────────────────

    pub async fn get_truth(&self) -> PlantTruth {
        let s = self.state.lock().await;
        PlantTruth {
            position: s.position,
            velocity: s.velocity,
            current: s.current,
            temperature: s.temperature,
            sim_time_s: s.sim_time_s,
        }
    }

    pub async fn set_plant_state(
        &self,
        position: f64,
        velocity: f64,
        current: Option<f64>,
        temperature: Option<f64>,
    ) {
        let mut s = self.state.lock().await;
        s.position = position;
        s.velocity = velocity;
        if let Some(c) = current {
            s.current = c;
        }
        if let Some(t) = temperature {
            s.temperature = t;
        }
    }

    /// `duration_ms == 0` means apply indefinitely until reset.
    pub async fn apply_external_torque(&self, torque: f64, duration_ms: u32) {
        let mut s = self.state.lock().await;
        s.external_torque = torque;
        s.external_torque_ticks =
            if duration_ms == 0 { u64::MAX } else { duration_ms as u64 };
    }

    pub async fn set_ambient_temperature(&self, temp: f64) {
        self.state.lock().await.ambient_temperature = temp;
    }

    pub async fn inject_fault(&self, kind: SimFaultKind) {
        let mut s = self.state.lock().await;
        match kind {
            SimFaultKind::OverTemperature => s.temperature = 100_000.0,
            SimFaultKind::OverCurrent => s.current = 100_000.0,
            SimFaultKind::EncoderStuck => s.velocity = 0.0,
        }
    }

    pub async fn pause(&self) {
        self.state.lock().await.paused = true;
    }

    pub async fn resume(&self) {
        self.state.lock().await.paused = false;
    }

    pub async fn step(&self, dt: f64) {
        // step() is only meaningful while paused; it temporarily unpauses for
        // one integration step.
        {
            self.state.lock().await.paused = false;
        }
        self.tick(dt).await;
        {
            self.state.lock().await.paused = true;
        }
    }
}

// ── Hardware impl ─────────────────────────────────────────────────────────────

#[async_trait]
impl Hardware for SimPlant {
    async fn read_position_raw(&self) -> f64 {
        // TODO: add Gaussian encoder noise when encoder_noise_std > 0
        self.state.lock().await.position
    }

    async fn read_velocity_raw(&self) -> f64 {
        self.state.lock().await.velocity
    }

    async fn read_current(&self) -> f64 {
        self.state.lock().await.current
    }

    async fn read_temperature(&self) -> f64 {
        self.state.lock().await.temperature
    }

    async fn apply_motor_command(&self, mode: ControlMode, setpoint: f64) {
        let mut s = self.state.lock().await;
        s.commanded_mode = mode;
        s.commanded_setpoint = setpoint;
    }

    async fn sim_time_s(&self) -> f64 {
        self.state.lock().await.sim_time_s
    }
}
