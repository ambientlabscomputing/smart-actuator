use std::sync::Arc;

use tracing::{debug, info, warn};

use crate::hardware::Hardware;
use crate::types::{
    CommandResponse, ControlMode, CurrentResponse, ExecutorState, PositionResponse, RefusalReason,
    SafetyConfig, TemperatureResponse, TrackingErrorReport, TrajectorySegment, VelocityResponse,
};

// ── Service trait ─────────────────────────────────────────────────────────────

/// The actuator service contract — transport-independent.
/// Both the real firmware and the simulator implement this trait.
#[async_trait::async_trait]
pub trait Service: Send + Sync {
    async fn start(&self);
    async fn stop(&self);

    // ── Level 1 ──────────────────────────────────────────────────────────────

    /// Set the target position (radians).
    async fn set_position(&self, angle: f64) -> CommandResponse;
    /// Set the target velocity (rad/s).
    async fn set_velocity(&self, velocity: f64) -> CommandResponse;
    /// Set the target torque (N·m).
    async fn set_torque(&self, torque: f64) -> CommandResponse;

    /// Return the current position.
    async fn read_position(&self) -> PositionResponse;
    /// Return the current velocity.
    async fn read_velocity(&self) -> VelocityResponse;
    /// Return the current draw.
    async fn read_current(&self) -> CurrentResponse;

    // ── Level 2 ──────────────────────────────────────────────────────────────

    async fn set_soft_limits(&self, min: f64, max: f64) -> CommandResponse;
    async fn set_current_limit(&self, max_current: f64) -> CommandResponse;
    async fn set_temperature_limit(&self, max_temperature: f64) -> CommandResponse;
    async fn set_control_mode(&self, mode: ControlMode) -> CommandResponse;
    async fn clear_fault(&self) -> CommandResponse;
    async fn read_temperature(&self) -> TemperatureResponse;

    // ── Level 3 ──────────────────────────────────────────────────────────────

    async fn execute_trajectory_segment(&self, segment: TrajectorySegment) -> CommandResponse;
    async fn pause(&self) -> CommandResponse;
    async fn resume(&self) -> CommandResponse;
    async fn abort(&self) -> CommandResponse;
    async fn report_tracking_error(&self) -> TrackingErrorReport;
    /// Sim-monotonic clock in seconds (0.0 on real hardware).
    async fn get_clock(&self) -> f64;
}

// ── Internal control state ────────────────────────────────────────────────────

/// What the physics loop should drive the hardware toward.
#[derive(Debug, Clone, Copy)]
enum CommandedSetpoint {
    Position(f64),
    Velocity(f64),
    Torque(f64),
    /// Brake: command zero velocity until next explicit command.
    Hold,
}

impl CommandedSetpoint {
    fn to_hardware(self) -> (ControlMode, f64) {
        match self {
            Self::Position(v) => (ControlMode::Position, v),
            Self::Velocity(v) => (ControlMode::Velocity, v),
            Self::Torque(v) => (ControlMode::Torque, v),
            Self::Hold => (ControlMode::Velocity, 0.0),
        }
    }
}

struct TrajectoryExecutor {
    state: ExecutorState,
    segment: Option<TrajectorySegment>,
    /// Seconds elapsed since the current segment started.
    elapsed_s: f64,
    last_error: f64,
    max_error: f64,
    errors_sq_sum: f64,
    errors_count: u64,
}

impl TrajectoryExecutor {
    fn new() -> Self {
        Self {
            state: ExecutorState::Idle,
            segment: None,
            elapsed_s: 0.0,
            last_error: 0.0,
            max_error: 0.0,
            errors_sq_sum: 0.0,
            errors_count: 0,
        }
    }

    fn reset_tracking(&mut self) {
        self.last_error = 0.0;
        self.max_error = 0.0;
        self.errors_sq_sum = 0.0;
        self.errors_count = 0;
    }

    fn update_tracking(&mut self, error: f64) {
        self.last_error = error;
        self.max_error = self.max_error.max(error);
        self.errors_sq_sum += error * error;
        self.errors_count += 1;
    }

    fn tracking_report(&self) -> TrackingErrorReport {
        let rms = if self.errors_count > 0 {
            (self.errors_sq_sum / self.errors_count as f64).sqrt()
        } else {
            0.0
        };
        TrackingErrorReport {
            instantaneous: self.last_error,
            max_since_start: self.max_error,
            rms,
        }
    }
}

struct ControlState {
    /// `None` = no restriction (any command accepted, backward-compatible).
    /// `Some(mode)` = enforced; wrong-mode commands are refused.
    mode: Option<ControlMode>,
    /// Current commanded setpoint from the controller.
    setpoint: CommandedSetpoint,
    safety: SafetyConfig,
    /// Latched fault — cleared by `clear_fault`.
    fault: Option<RefusalReason>,
    executor: TrajectoryExecutor,
}

impl ControlState {
    fn new() -> Self {
        Self {
            mode: None,
            setpoint: CommandedSetpoint::Hold,
            safety: SafetyConfig::default(),
            fault: None,
            executor: TrajectoryExecutor::new(),
        }
    }

    /// Gate check applied before every motion command.
    fn admit_motion(
        &self,
        requested_mode: ControlMode,
        position_target: Option<f64>,
    ) -> Result<(), RefusalReason> {
        // Latched fault blocks all motion
        if self.fault.is_some() {
            return Err(RefusalReason::FaultLatched);
        }
        // Mode enforcement (only when a mode has been explicitly set)
        if let Some(active_mode) = self.mode {
            if active_mode == ControlMode::Impedance {
                return Err(RefusalReason::NotImplemented);
            }
            if active_mode != requested_mode {
                return Err(RefusalReason::WrongControlMode);
            }
        }
        // Trajectory running — direct commands would race with the executor
        if self.executor.state == ExecutorState::Running {
            return Err(RefusalReason::TrajectoryRunning);
        }
        // Soft-limit check (position commands only)
        if let Some(angle) = position_target {
            if angle < self.safety.soft_limit_min || angle > self.safety.soft_limit_max {
                return Err(RefusalReason::OutsideSoftLimits);
            }
        }
        Ok(())
    }
}

// ── AppService ────────────────────────────────────────────────────────────────

/// Actuator service backed by a `Hardware` implementation.
/// - Simulator supplies `SimPlant` (dynamics model + encoder noise).
/// - Firmware supplies HAL drivers.
///
/// The physics tick task calls `tick(dt)` at a fixed rate; everything else
/// is driven by gRPC requests.
pub struct AppService {
    hardware: Arc<dyn Hardware>,
    control: tokio::sync::Mutex<ControlState>,
}

impl AppService {
    pub fn new(hardware: Arc<dyn Hardware>) -> Self {
        Self {
            hardware,
            control: tokio::sync::Mutex::new(ControlState::new()),
        }
    }

    /// Physics tick — called by the tick task in `main.rs` at `1/dt` Hz.
    ///
    /// 1. Reads hardware state (thermal fault detection).
    /// 2. Advances the trajectory executor (if running).
    /// 3. Applies the resulting setpoint to the hardware.
    pub async fn tick(&self, dt: f64) {
        // Phase 1: read hardware (no lock held so there's no deadlock risk)
        let pos = self.hardware.read_position_raw().await;
        let temp = self.hardware.read_temperature().await;

        // Phase 2: compute setpoint under a brief lock
        let (apply_mode, apply_setpoint) = {
            let mut ctrl = self.control.lock().await;

            // Thermal fault detection
            if temp > ctrl.safety.temperature_limit && ctrl.fault.is_none() {
                warn!(
                    temp,
                    limit = ctrl.safety.temperature_limit,
                    "thermal fault latched"
                );
                ctrl.fault = Some(RefusalReason::OverTemperature);
            }

            if ctrl.fault.is_some() {
                // Safety hold — brake at zero velocity
                (ControlMode::Velocity, 0.0)
            } else if ctrl.executor.state == ExecutorState::Running {
                ctrl.executor.elapsed_s += dt;
                let seg = ctrl.executor.segment.as_ref().unwrap();
                match seg.interpolate(ctrl.executor.elapsed_s) {
                    Some(ref_pt) => {
                        let err = (pos - ref_pt.position).abs();
                        ctrl.executor.update_tracking(err);
                        (ControlMode::Position, ref_pt.position)
                    }
                    None => {
                        // Segment complete — return to last commanded setpoint
                        info!("trajectory segment complete");
                        ctrl.executor.state = ExecutorState::Idle;
                        ctrl.setpoint.to_hardware()
                    }
                }
            } else {
                ctrl.setpoint.to_hardware()
            }
        }; // lock released

        // Phase 3: apply (no lock held)
        self.hardware.apply_motor_command(apply_mode, apply_setpoint).await;
    }
}

// ── Service impl ──────────────────────────────────────────────────────────────

#[async_trait::async_trait]
impl Service for AppService {
    async fn start(&self) {
        info!("AppService started");
    }

    async fn stop(&self) {
        info!("AppService stopped");
    }

    // ── Level 1 ──────────────────────────────────────────────────────────────

    async fn set_position(&self, angle: f64) -> CommandResponse {
        debug!(angle, "set_position");
        let mut ctrl = self.control.lock().await;
        if let Err(reason) = ctrl.admit_motion(ControlMode::Position, Some(angle)) {
            return CommandResponse::refused(reason);
        }
        ctrl.setpoint = CommandedSetpoint::Position(angle);
        CommandResponse::ok("Position set")
    }

    async fn set_velocity(&self, velocity: f64) -> CommandResponse {
        debug!(velocity, "set_velocity");
        let mut ctrl = self.control.lock().await;
        if let Err(reason) = ctrl.admit_motion(ControlMode::Velocity, None) {
            return CommandResponse::refused(reason);
        }
        ctrl.setpoint = CommandedSetpoint::Velocity(velocity);
        CommandResponse::ok("Velocity set")
    }

    async fn set_torque(&self, torque: f64) -> CommandResponse {
        debug!(torque, "set_torque");
        let mut ctrl = self.control.lock().await;
        if let Err(reason) = ctrl.admit_motion(ControlMode::Torque, None) {
            return CommandResponse::refused(reason);
        }
        ctrl.setpoint = CommandedSetpoint::Torque(torque);
        CommandResponse::ok("Torque set")
    }

    async fn read_position(&self) -> PositionResponse {
        PositionResponse { angle: self.hardware.read_position_raw().await }
    }

    async fn read_velocity(&self) -> VelocityResponse {
        VelocityResponse { velocity: self.hardware.read_velocity_raw().await }
    }

    async fn read_current(&self) -> CurrentResponse {
        CurrentResponse { current: self.hardware.read_current().await }
    }

    // ── Level 2 ──────────────────────────────────────────────────────────────

    async fn set_soft_limits(&self, min: f64, max: f64) -> CommandResponse {
        debug!(min, max, "set_soft_limits");
        if min >= max {
            return CommandResponse::refused(RefusalReason::InvalidTrajectory);
        }
        let mut ctrl = self.control.lock().await;
        ctrl.safety.soft_limit_min = min;
        ctrl.safety.soft_limit_max = max;
        CommandResponse::ok(format!("Soft limits set [{min:.4}, {max:.4}] rad"))
    }

    async fn set_current_limit(&self, max_current: f64) -> CommandResponse {
        debug!(max_current, "set_current_limit");
        self.control.lock().await.safety.current_limit = max_current;
        CommandResponse::ok(format!("Current limit set {max_current:.3} A"))
    }

    async fn set_temperature_limit(&self, max_temperature: f64) -> CommandResponse {
        debug!(max_temperature, "set_temperature_limit");
        self.control.lock().await.safety.temperature_limit = max_temperature;
        CommandResponse::ok(format!("Temperature limit set {max_temperature:.1} °C"))
    }

    async fn set_control_mode(&self, mode: ControlMode) -> CommandResponse {
        debug!(?mode, "set_control_mode");
        if mode == ControlMode::Impedance {
            return CommandResponse::refused(RefusalReason::NotImplemented);
        }
        let mut ctrl = self.control.lock().await;
        if ctrl.executor.state == ExecutorState::Running {
            return CommandResponse::refused(RefusalReason::TrajectoryRunning);
        }
        ctrl.mode = Some(mode);
        ctrl.setpoint = CommandedSetpoint::Hold;
        CommandResponse::ok(format!("Control mode set to {mode:?}"))
    }

    async fn clear_fault(&self) -> CommandResponse {
        self.control.lock().await.fault = None;
        CommandResponse::ok("Fault cleared")
    }

    async fn read_temperature(&self) -> TemperatureResponse {
        TemperatureResponse { temperature: self.hardware.read_temperature().await }
    }

    // ── Level 3 ──────────────────────────────────────────────────────────────

    async fn execute_trajectory_segment(&self, segment: TrajectorySegment) -> CommandResponse {
        debug!(points = segment.points.len(), "execute_trajectory_segment");
        if segment.points.len() < 2 {
            return CommandResponse::refused(RefusalReason::InvalidTrajectory);
        }
        let mut ctrl = self.control.lock().await;
        if ctrl.fault.is_some() {
            return CommandResponse::refused(RefusalReason::FaultLatched);
        }
        ctrl.executor.segment = Some(segment);
        ctrl.executor.elapsed_s = 0.0;
        ctrl.executor.state = ExecutorState::Running;
        ctrl.executor.reset_tracking();
        CommandResponse::ok("Trajectory segment started")
    }

    async fn pause(&self) -> CommandResponse {
        let mut ctrl = self.control.lock().await;
        if ctrl.executor.state != ExecutorState::Running {
            return CommandResponse::ok("Nothing running — no-op");
        }
        ctrl.executor.state = ExecutorState::Paused;
        CommandResponse::ok("Trajectory paused")
    }

    async fn resume(&self) -> CommandResponse {
        let mut ctrl = self.control.lock().await;
        if ctrl.executor.state != ExecutorState::Paused {
            return CommandResponse::ok("Not paused — no-op");
        }
        ctrl.executor.state = ExecutorState::Running;
        CommandResponse::ok("Trajectory resumed")
    }

    async fn abort(&self) -> CommandResponse {
        let mut ctrl = self.control.lock().await;
        ctrl.executor.state = ExecutorState::Aborted;
        ctrl.setpoint = CommandedSetpoint::Hold;
        CommandResponse::ok("Trajectory aborted — holding position")
    }

    async fn report_tracking_error(&self) -> TrackingErrorReport {
        self.control.lock().await.executor.tracking_report()
    }

    async fn get_clock(&self) -> f64 {
        self.hardware.sim_time_s().await
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TrajectoryPoint;

    // Minimal Hardware stub for unit tests: instantly snaps to commanded setpoint
    // so tests can verify set→read without a real physics loop.
    struct StubHardware {
        position: tokio::sync::Mutex<f64>,
        velocity: tokio::sync::Mutex<f64>,
        current: tokio::sync::Mutex<f64>,
        temperature: tokio::sync::Mutex<f64>,
    }

    impl StubHardware {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                position: tokio::sync::Mutex::new(0.0),
                velocity: tokio::sync::Mutex::new(0.0),
                current: tokio::sync::Mutex::new(0.0),
                temperature: tokio::sync::Mutex::new(25.0),
            })
        }
    }

    #[async_trait::async_trait]
    impl Hardware for StubHardware {
        async fn read_position_raw(&self) -> f64 { *self.position.lock().await }
        async fn read_velocity_raw(&self) -> f64 { *self.velocity.lock().await }
        async fn read_current(&self) -> f64 { *self.current.lock().await }
        async fn read_temperature(&self) -> f64 { *self.temperature.lock().await }
        async fn apply_motor_command(&self, mode: ControlMode, setpoint: f64) {
            // Immediately snap to commanded value for test predictability
            match mode {
                ControlMode::Position => *self.position.lock().await = setpoint,
                ControlMode::Velocity => *self.velocity.lock().await = setpoint,
                ControlMode::Torque | ControlMode::Impedance => {}
            }
        }
    }

    fn svc() -> AppService {
        AppService::new(StubHardware::new())
    }

    // ── Level 1 ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn set_and_read_position() {
        let s = svc();
        let resp = s.set_position(1.23).await;
        assert!(resp.success, "{}", resp.message);
        s.tick(0.0).await; // flush setpoint to stub hardware
        assert_eq!(s.read_position().await.angle, 1.23);
    }

    #[tokio::test]
    async fn set_and_read_velocity() {
        let s = svc();
        let resp = s.set_velocity(0.5).await;
        assert!(resp.success, "{}", resp.message);
        s.tick(0.0).await;
        assert_eq!(s.read_velocity().await.velocity, 0.5);
    }

    #[tokio::test]
    async fn set_and_read_torque() {
        let s = svc();
        let resp = s.set_torque(2.0).await;
        assert!(resp.success, "{}", resp.message);
    }

    #[tokio::test]
    async fn initial_position_is_zero() {
        let s = svc();
        assert_eq!(s.read_position().await.angle, 0.0);
    }

    // ── Level 2 ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn soft_limit_refusal() {
        let s = svc();
        s.set_soft_limits(-1.0, 1.0).await;
        let resp = s.set_position(2.0).await;
        assert!(!resp.success);
        assert_eq!(resp.refusal, Some(RefusalReason::OutsideSoftLimits));
    }

    #[tokio::test]
    async fn soft_limit_within_range_accepted() {
        let s = svc();
        s.set_soft_limits(-1.0, 1.0).await;
        let resp = s.set_position(0.5).await;
        assert!(resp.success, "{}", resp.message);
    }

    #[tokio::test]
    async fn mode_mismatch_refusal() {
        let s = svc();
        s.set_control_mode(ControlMode::Position).await;
        let resp = s.set_velocity(1.0).await;
        assert!(!resp.success);
        assert_eq!(resp.refusal, Some(RefusalReason::WrongControlMode));
    }

    #[tokio::test]
    async fn mode_none_accepts_any_command() {
        let s = svc();
        // Without set_control_mode, all motion commands are accepted
        assert!(s.set_position(1.0).await.success);
        assert!(s.set_velocity(1.0).await.success);
        assert!(s.set_torque(1.0).await.success);
    }

    #[tokio::test]
    async fn impedance_mode_refused() {
        let s = svc();
        let resp = s.set_control_mode(ControlMode::Impedance).await;
        assert!(!resp.success);
        assert_eq!(resp.refusal, Some(RefusalReason::NotImplemented));
    }

    #[tokio::test]
    async fn thermal_fault_latches_and_clears() {
        let hw = StubHardware::new();
        let s = AppService::new(hw.clone());
        s.set_temperature_limit(50.0).await;
        // Inject over-temp via the stub
        *hw.temperature.lock().await = 60.0;
        s.tick(0.001).await;
        // Motion command should now be refused
        let resp = s.set_position(1.0).await;
        assert!(!resp.success);
        assert_eq!(resp.refusal, Some(RefusalReason::FaultLatched));
        // Clear fault — motion should work again
        s.clear_fault().await;
        assert!(s.set_position(1.0).await.success);
    }

    // ── Level 3 ──────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn trajectory_requires_two_points() {
        let s = svc();
        let seg = TrajectorySegment {
            points: vec![TrajectoryPoint { time_s: 0.0, position: 0.0, velocity: 0.0, torque_ff: 0.0 }],
            start_time_s: 0.0,
        };
        let resp = s.execute_trajectory_segment(seg).await;
        assert!(!resp.success);
        assert_eq!(resp.refusal, Some(RefusalReason::InvalidTrajectory));
    }

    #[tokio::test]
    async fn trajectory_runs_and_completes() {
        let s = svc();
        let seg = TrajectorySegment {
            points: vec![
                TrajectoryPoint { time_s: 0.0, position: 0.0, velocity: 0.0, torque_ff: 0.0 },
                TrajectoryPoint { time_s: 1.0, position: 1.0, velocity: 1.0, torque_ff: 0.0 },
            ],
            start_time_s: 0.0,
        };
        s.execute_trajectory_segment(seg).await;
        // A single tick past the segment end transitions the executor to Idle
        s.tick(2.0).await;
        assert_eq!(s.control.lock().await.executor.state, ExecutorState::Idle);
    }

    #[tokio::test]
    async fn pause_resume_abort() {
        let s = svc();
        let seg = TrajectorySegment {
            points: vec![
                TrajectoryPoint { time_s: 0.0, position: 0.0, velocity: 0.0, torque_ff: 0.0 },
                TrajectoryPoint { time_s: 10.0, position: 1.0, velocity: 0.1, torque_ff: 0.0 },
            ],
            start_time_s: 0.0,
        };
        s.execute_trajectory_segment(seg).await;
        assert!(s.pause().await.success);
        assert_eq!(s.control.lock().await.executor.state, ExecutorState::Paused);
        assert!(s.resume().await.success);
        assert_eq!(s.control.lock().await.executor.state, ExecutorState::Running);
        assert!(s.abort().await.success);
        assert_eq!(s.control.lock().await.executor.state, ExecutorState::Aborted);
    }

    #[tokio::test]
    async fn direct_command_refused_while_trajectory_running() {
        let s = svc();
        let seg = TrajectorySegment {
            points: vec![
                TrajectoryPoint { time_s: 0.0, position: 0.0, velocity: 0.0, torque_ff: 0.0 },
                TrajectoryPoint { time_s: 10.0, position: 1.0, velocity: 0.1, torque_ff: 0.0 },
            ],
            start_time_s: 0.0,
        };
        s.execute_trajectory_segment(seg).await;
        let resp = s.set_position(0.5).await;
        assert!(!resp.success);
        assert_eq!(resp.refusal, Some(RefusalReason::TrajectoryRunning));
    }
}

