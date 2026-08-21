//! Actuator physics plant — Euler-integration dynamics model.
//!
//! Extracted from `actuator-sim` so that both the simulator binary and the
//! wasm demo crate can share the exact same physics without pulling in
//! tokio/tonic/std::fs or any other host-only dependency.

use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tracing::trace;

use actuator_core::{hardware::Hardware, types::ControlMode};

/// Wrap an angle (rad) into `[-π, π)`.
///
/// Used by the position controller so the error always describes the *shortest*
/// path around the circle. Without this, a setpoint just past the 0/2π seam
/// (e.g. commanding 0 rad while the rotor sits at 2π⁻) yields an error of ~−2π
/// and the motor drives the long way around instead of nudging forward across
/// the seam.
#[inline]
pub fn wrap_to_pi(angle: f64) -> f64 {
    use std::f64::consts::{PI, TAU};
    (angle + PI).rem_euclid(TAU) - PI
}


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
    pub commanded_mode: ControlMode,
}

// ── Fault injection kinds ─────────────────────────────────────────────────────

pub enum SimFaultKind {
    OverTemperature,
    OverCurrent,
    EncoderStuck,
}

// ── Internal state ────────────────────────────────────────────────────────────

struct PlantState {
    position: f64,            // rad
    velocity: f64,            // rad/s
    current: f64,             // A
    temperature: f64,         // °C
    ambient_temperature: f64, // °C
    commanded_mode: ControlMode,
    commanded_setpoint: f64,
    external_torque: f64,        // N·m (set by backdoor)
    external_torque_ticks: u64,  // ticks remaining; u64::MAX = indefinite
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
    params: Mutex<PlantParams>,
}

impl SimPlant {
    pub fn new(params: PlantParams) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(PlantState::default()),
            params: Mutex::new(params),
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
        let p = self.params.lock().await;

        // Controller torque from commanded mode/setpoint
        let motor_torque = match s.commanded_mode {
            ControlMode::Position => {
                // Shortest-path error: wrap into [-π, π) so motion continues
                // forward across the 0/2π seam instead of unwinding backward.
                let err = wrap_to_pi(s.commanded_setpoint - s.position);
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

    // ── Backdoor access ───────────────────────────────────────────────────────

    pub async fn get_truth(&self) -> PlantTruth {
        let s = self.state.lock().await;
        PlantTruth {
            position: s.position,
            velocity: s.velocity,
            current: s.current,
            temperature: s.temperature,
            sim_time_s: s.sim_time_s,
            commanded_mode: s.commanded_mode,
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
        // Temporarily unpause for one integration step.
        self.state.lock().await.paused = false;
        self.tick(dt).await;
        self.state.lock().await.paused = true;
    }

    /// Update control gains at runtime (exposed to the WASM demo).
    pub async fn update_gains(&self, kp_pos: f64, kd_pos: f64, kp_vel: f64) {
        let mut p = self.params.lock().await;
        p.kp_pos = kp_pos;
        p.kd_pos = kd_pos;
        p.kp_vel = kp_vel;
    }

    /// Replace the entire param set (used by actuator-sim config reload).
    pub async fn set_params(&self, params: PlantParams) {
        *self.params.lock().await = params;
    }

    pub async fn get_params(&self) -> PlantParams {
        self.params.lock().await.clone()
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::{PI, TAU};

    #[test]
    fn wrap_to_pi_maps_into_range() {
        assert!((wrap_to_pi(0.0) - 0.0).abs() < 1e-12);
        assert!((wrap_to_pi(TAU) - 0.0).abs() < 1e-12);
        assert!((wrap_to_pi(PI - 0.01) - (PI - 0.01)).abs() < 1e-12);
        // Just past +π wraps to just past −π.
        assert!((wrap_to_pi(PI + 0.01) - (-PI + 0.01)).abs() < 1e-9);
        // A setpoint of 0 with the rotor near 2π⁻ → tiny positive error.
        let err = wrap_to_pi(0.0 - (TAU - 0.05));
        assert!(err > 0.0 && err < 0.1, "expected small positive err, got {err}");
    }

    #[tokio::test]
    async fn position_control_takes_short_path_across_seam() {
        // Rotor parked just shy of a full turn; command 0 rad.
        // Correct behavior: drive *forward* across the seam (velocity > 0),
        // not backward all the way around.
        let plant = SimPlant::new(PlantParams {
            inertia: 0.01,
            damping: 0.05,
            encoder_noise_std: 0.0,
            kp_pos: 5.0,
            kd_pos: 0.5,
            kp_vel: 1.0,
            kt: 1.0,
            thermal_capacitance: 100.0,
            thermal_resistance: 1.0,
        });
        plant
            .set_plant_state(TAU - 0.05, 0.0, None, None)
            .await;
        plant.apply_motor_command(ControlMode::Position, 0.0).await;
        plant.tick(0.001).await;

        let truth = plant.get_truth().await;
        assert!(
            truth.velocity > 0.0,
            "rotor should advance forward across the 0/2π seam, got vel={}",
            truth.velocity
        );
    }
}
