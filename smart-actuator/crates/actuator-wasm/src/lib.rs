//! WebAssembly bindings for the smart-actuator simulation engine.
//!
//! This crate wraps the genuine `actuator-plant` (Euler-integration physics)
//! and `actuator-core` (PD control loop + trajectory executor) with
//! `wasm-bindgen` so they can be driven from a browser Web Worker.
//!
//! All async methods on SimPlant / AppService only ever contend on an
//! in-memory Mutex with no real I/O — they complete immediately.  We drive
//! them with `futures::executor::block_on` which works correctly in a
//! single-threaded wasm environment.

use std::sync::Arc;

use actuator_core::{
    types::{ControlMode, TrajectoryPoint, TrajectorySegment},
    AppService, Service,
};
use actuator_plant::{PlantParams, SimFaultKind, SimPlant};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ── Init (called once on worker startup) ─────────────────────────────────────

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// ── Telemetry snapshot (returned by read_state) ───────────────────────────────

#[derive(Debug, Serialize)]
pub struct ActuatorState {
    pub position: f64,     // rad
    pub velocity: f64,     // rad/s
    pub current: f64,      // A
    pub temperature: f64,  // °C
    pub sim_time_s: f64,
    /// "position" | "velocity" | "torque" | "impedance"
    pub mode: String,
    /// Non-empty when a fault is latched.
    pub fault: String,
}

// ── Init config (passed from JS as a plain object) ────────────────────────────

#[derive(Debug, Deserialize)]
pub struct WasmConfig {
    #[serde(default = "default_inertia")]
    pub inertia: f64,
    #[serde(default = "default_damping")]
    pub damping: f64,
    #[serde(default = "default_kp_pos")]
    pub kp_pos: f64,
    #[serde(default = "default_kd_pos")]
    pub kd_pos: f64,
    #[serde(default = "default_kp_vel")]
    pub kp_vel: f64,
    #[serde(default = "default_kt")]
    pub kt: f64,
    #[serde(default = "default_thermal_resistance")]
    pub thermal_resistance: f64,
    #[serde(default = "default_thermal_capacitance")]
    pub thermal_capacitance: f64,
}

fn default_inertia() -> f64 { 0.01 }
fn default_damping() -> f64 { 0.1 }
fn default_kp_pos() -> f64 { 10.0 }
fn default_kd_pos() -> f64 { 2.0 }
fn default_kp_vel() -> f64 { 1.0 }
fn default_kt() -> f64 { 2.0 }
fn default_thermal_resistance() -> f64 { 5.0 }
fn default_thermal_capacitance() -> f64 { 10.0 }

// ── WasmActuator ──────────────────────────────────────────────────────────────

/// Main handle exposed to JavaScript.
///
/// Create one per demo instance.  All methods are synchronous from JS's
/// perspective — the underlying async calls resolve immediately because there
/// is no real I/O (just in-memory Mutex locks in a single-threaded wasm env).
#[wasm_bindgen]
pub struct WasmActuator {
    plant: Arc<SimPlant>,
    service: Arc<AppService>,
    /// Cached fault string for read_state.
    fault: String,
}

#[wasm_bindgen]
impl WasmActuator {
    /// Create a new actuator sim with optional config.
    ///
    /// `config` is a JS object matching `WasmConfig` fields; omitted fields
    /// use physical defaults.  Pass `null` or `undefined` for all defaults.
    #[wasm_bindgen(constructor)]
    pub fn new(config: JsValue) -> Result<WasmActuator, JsValue> {
        let cfg: WasmConfig = if config.is_null() || config.is_undefined() {
            // No config supplied — use physical defaults directly.
            WasmConfig {
                inertia: default_inertia(),
                damping: default_damping(),
                kp_pos: default_kp_pos(),
                kd_pos: default_kd_pos(),
                kp_vel: default_kp_vel(),
                kt: default_kt(),
                thermal_resistance: default_thermal_resistance(),
                thermal_capacitance: default_thermal_capacitance(),
            }
        } else {
            serde_wasm_bindgen::from_value(config)?
        };

        let params = PlantParams {
            inertia: cfg.inertia,
            damping: cfg.damping,
            encoder_noise_std: 0.0,
            kp_pos: cfg.kp_pos,
            kd_pos: cfg.kd_pos,
            kp_vel: cfg.kp_vel,
            kt: cfg.kt,
            thermal_resistance: cfg.thermal_resistance,
            thermal_capacitance: cfg.thermal_capacitance,
        };

        let plant = SimPlant::new(params);
        let service = Arc::new(AppService::new(plant.clone()));

        Ok(WasmActuator {
            plant,
            service,
            fault: String::new(),
        })
    }

    // ── Simulation step ───────────────────────────────────────────────────────

    /// Advance the simulation by `dt` seconds.
    ///
    /// Call this in a tight loop from the Web Worker.  A dt of 0.001 (1 ms)
    /// gives a 1 kHz control + physics update rate, matching the real sim.
    pub fn step(&self, dt: f64) {
        block(self.service.tick(dt));
        block(self.plant.tick(dt));
    }

    // ── Telemetry ─────────────────────────────────────────────────────────────

    /// Read all state in one call.  Returns a JS object `ActuatorState`.
    pub fn read_state(&self) -> JsValue {
        let truth = block(self.plant.get_truth());
        let state = ActuatorState {
            position: truth.position,
            velocity: truth.velocity,
            current: truth.current,
            temperature: truth.temperature,
            sim_time_s: truth.sim_time_s,
            mode: mode_name(truth.commanded_mode),
            fault: self.fault.clone(),
        };
        serde_wasm_bindgen::to_value(&state).unwrap_or(JsValue::NULL)
    }

    // ── Level 1: motion commands ──────────────────────────────────────────────

    /// Set target position (radians).
    pub fn set_position(&mut self, angle: f64) -> bool {
        let r = block(self.service.set_position(angle));
        if r.success {
            self.fault.clear();
        }
        self.update_fault_from_response(&r.message, r.success);
        r.success
    }

    /// Set target velocity (rad/s).
    pub fn set_velocity(&mut self, velocity: f64) -> bool {
        let r = block(self.service.set_velocity(velocity));
        if r.success {
            self.fault.clear();
        }
        self.update_fault_from_response(&r.message, r.success);
        r.success
    }

    /// Set target torque (N·m).
    pub fn set_torque(&mut self, torque: f64) -> bool {
        let r = block(self.service.set_torque(torque));
        if r.success {
            self.fault.clear();
        }
        self.update_fault_from_response(&r.message, r.success);
        r.success
    }

    // ── Level 2: safety / mode ────────────────────────────────────────────────

    /// Set control mode (0=Position, 1=Velocity, 2=Torque).
    pub fn set_control_mode(&mut self, mode: u8) -> bool {
        let m = match mode {
            0 => ControlMode::Position,
            1 => ControlMode::Velocity,
            2 => ControlMode::Torque,
            3 => ControlMode::Impedance,
            _ => return false,
        };
        let r = block(self.service.set_control_mode(m));
        r.success
    }

    pub fn set_soft_limits(&self, min: f64, max: f64) -> bool {
        block(self.service.set_soft_limits(min, max)).success
    }

    pub fn set_current_limit(&self, max_current: f64) -> bool {
        block(self.service.set_current_limit(max_current)).success
    }

    pub fn set_temperature_limit(&self, max_temperature: f64) -> bool {
        block(self.service.set_temperature_limit(max_temperature)).success
    }

    /// Clear a latched fault so motion commands are accepted again.
    pub fn clear_fault(&mut self) -> bool {
        let r = block(self.service.clear_fault());
        if r.success {
            self.fault.clear();
        }
        r.success
    }

    // ── Level 3: trajectory ───────────────────────────────────────────────────

    /// Execute a trajectory segment.
    ///
    /// `times_s`, `positions`, `velocities`, `torques_ff` are parallel
    /// Float64Arrays of equal length (≥ 2 points).
    pub fn execute_trajectory(
        &self,
        times_s: Vec<f64>,
        positions: Vec<f64>,
        velocities: Vec<f64>,
        torques_ff: Vec<f64>,
    ) -> bool {
        if times_s.len() < 2
            || positions.len() != times_s.len()
            || velocities.len() != times_s.len()
            || torques_ff.len() != times_s.len()
        {
            return false;
        }
        let points: Vec<TrajectoryPoint> = times_s
            .iter()
            .enumerate()
            .map(|(i, &t)| TrajectoryPoint {
                time_s: t,
                position: positions[i],
                velocity: velocities[i],
                torque_ff: torques_ff[i],
            })
            .collect();

        let segment = TrajectorySegment {
            points,
            start_time_s: block(self.service.get_clock()),
        };
        block(self.service.execute_trajectory_segment(segment)).success
    }

    pub fn pause_trajectory(&self) -> bool {
        block(self.service.pause()).success
    }

    pub fn resume_trajectory(&self) -> bool {
        block(self.service.resume()).success
    }

    pub fn abort_trajectory(&self) -> bool {
        block(self.service.abort()).success
    }

    // ── Gains ─────────────────────────────────────────────────────────────────

    /// Update PD/P gains at runtime.
    pub fn update_gains(&self, kp_pos: f64, kd_pos: f64, kp_vel: f64) {
        block(self.plant.update_gains(kp_pos, kd_pos, kp_vel));
    }

    // ── Backdoor / disturbance ────────────────────────────────────────────────

    /// Apply an external torque disturbance.
    /// `duration_ms == 0` applies indefinitely until reset.
    pub fn apply_external_torque(&self, torque_nm: f64, duration_ms: u32) {
        block(self.plant.apply_external_torque(torque_nm, duration_ms));
    }

    pub fn set_ambient_temperature(&self, temp_c: f64) {
        block(self.plant.set_ambient_temperature(temp_c));
    }

    /// Inject a fault: 0=OverTemperature, 1=OverCurrent, 2=EncoderStuck.
    pub fn inject_fault(&mut self, kind: u8) {
        let k = match kind {
            0 => SimFaultKind::OverTemperature,
            1 => SimFaultKind::OverCurrent,
            2 => SimFaultKind::EncoderStuck,
            _ => return,
        };
        let name = match kind {
            0 => "OverTemperature",
            1 => "OverCurrent",
            _ => "EncoderStuck",
        };
        self.fault = name.to_string();
        block(self.plant.inject_fault(k));
    }

    pub fn set_plant_state(
        &self,
        position: f64,
        velocity: f64,
        current: Option<f64>,
        temperature: Option<f64>,
    ) {
        block(self.plant.set_plant_state(position, velocity, current, temperature));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn update_fault_from_response(&mut self, message: &str, success: bool) {
        if !success {
            self.fault = message.to_string();
        }
    }
}

// ── Utility: drive an immediately-resolving future synchronously ──────────────
//
// In single-threaded wasm, tokio::sync::Mutex always resolves without
// suspension (no contention). futures::executor::block_on works here.

fn block<F: std::future::Future>(f: F) -> F::Output {
    futures_executor::block_on(f)
}

fn mode_name(m: ControlMode) -> String {
    match m {
        ControlMode::Position => "position",
        ControlMode::Velocity => "velocity",
        ControlMode::Torque => "torque",
        ControlMode::Impedance => "impedance",
    }
    .to_string()
}
