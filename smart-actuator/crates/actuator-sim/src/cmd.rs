//! CLI client for the main `ActuatorService` wire endpoint.

use anyhow::Context;
use clap::Subcommand;

use actuator_proto::actuator::{CommandResponse, ControlModeProto};
use actuator_proto::wire::async_wire::WireClient;

#[derive(Debug, Subcommand)]
pub enum CmdCommand {
    /// Read position, velocity, current and temperature in one shot
    Status,
    /// Set target position (rad)
    Move {
        /// Target angle in radians
        angle: f64,
    },
    /// Set target velocity (rad/s)
    Velocity { velocity: f64 },
    /// Set target torque (Nm)
    Torque { torque: f64 },
    /// Set control mode [position | velocity | torque | impedance]
    SetMode { mode: String },
    /// Set soft position limits (rad)
    SetLimits { min: f64, max: f64 },
    /// Set maximum current limit (A)
    SetCurrentLimit { max_current: f64 },
    /// Set maximum temperature limit (deg C)
    SetTempLimit { max_temperature: f64 },
    /// Clear a latched fault
    ClearFault,
    /// Read the simulator clock (sim monotonic seconds)
    Clock,
    /// Report trajectory tracking error statistics
    TrackingError,
    /// Pause trajectory execution
    Pause,
    /// Resume a paused trajectory
    Resume,
    /// Abort and discard the active trajectory
    Abort,
}

fn parse_mode(s: &str) -> anyhow::Result<ControlModeProto> {
    match s.to_lowercase().as_str() {
        "position" | "pos" => Ok(ControlModeProto::ControlModePosition),
        "velocity" | "vel" => Ok(ControlModeProto::ControlModeVelocity),
        "torque" => Ok(ControlModeProto::ControlModeTorque),
        "impedance" => Ok(ControlModeProto::ControlModeImpedance),
        _ => anyhow::bail!("Unknown mode '{s}'. Valid: position, velocity, torque, impedance"),
    }
}

fn print_cmd(r: CommandResponse) {
    if r.success {
        println!("ok");
    } else {
        println!("refused [{}]: {}", refusal_name(r.refusal_code), r.message);
    }
}

fn refusal_name(code: i32) -> &'static str {
    match code {
        0 => "none",
        1 => "OutsideSoftLimits",
        2 => "WrongControlMode",
        3 => "OverTemperature",
        4 => "FaultLatched",
        5 => "NotImplemented",
        6 => "TrajectoryRunning",
        7 => "InvalidTrajectory",
        _ => "unknown",
    }
}

pub async fn execute(addr: String, cmd: CmdCommand) -> anyhow::Result<()> {
    let c = WireClient::connect(&addr)
        .await
        .context("Cannot connect to actuator service")?;

    match cmd {
        CmdCommand::Status => {
            let pos = c.read_position().await.context("read_position")?;
            let vel = c.read_velocity().await.context("read_velocity")?;
            let cur = c.read_current().await.context("read_current")?;
            let tmp = c.read_temperature().await.context("read_temperature")?;
            println!("position:    {:>12.4} rad", pos.angle);
            println!("velocity:    {:>12.4} rad/s", vel.velocity);
            println!("current:     {:>12.4} A", cur.current);
            println!("temperature: {:>12.4} C", tmp.temperature);
        }
        CmdCommand::Move { angle } => {
            print_cmd(c.set_position(angle).await.context("set_position")?);
        }
        CmdCommand::Velocity { velocity } => {
            print_cmd(c.set_velocity(velocity).await.context("set_velocity")?);
        }
        CmdCommand::Torque { torque } => {
            print_cmd(c.set_torque(torque).await.context("set_torque")?);
        }
        CmdCommand::SetMode { mode } => {
            let m = parse_mode(&mode)? as i32;
            print_cmd(c.set_control_mode(m).await.context("set_control_mode")?);
        }
        CmdCommand::SetLimits { min, max } => {
            print_cmd(c.set_soft_limits(min, max).await.context("set_soft_limits")?);
        }
        CmdCommand::SetCurrentLimit { max_current } => {
            print_cmd(c.set_current_limit(max_current).await.context("set_current_limit")?);
        }
        CmdCommand::SetTempLimit { max_temperature } => {
            print_cmd(
                c.set_temperature_limit(max_temperature)
                    .await
                    .context("set_temperature_limit")?,
            );
        }
        CmdCommand::ClearFault => {
            print_cmd(c.clear_fault().await.context("clear_fault")?);
        }
        CmdCommand::Clock => {
            let t = c.get_clock().await.context("get_clock")?;
            println!("sim_time: {:>14.6} s", t);
        }
        CmdCommand::TrackingError => {
            let r = c.report_tracking_error().await.context("report_tracking_error")?;
            println!("instantaneous:   {:>12.6} rad", r.instantaneous);
            println!("max_since_start: {:>12.6} rad", r.max_since_start);
            println!("rms:             {:>12.6} rad", r.rms);
        }
        CmdCommand::Pause => {
            print_cmd(c.pause().await.context("pause")?);
        }
        CmdCommand::Resume => {
            print_cmd(c.resume().await.context("resume")?);
        }
        CmdCommand::Abort => {
            print_cmd(c.abort().await.context("abort")?);
        }
    }

    Ok(())
}
