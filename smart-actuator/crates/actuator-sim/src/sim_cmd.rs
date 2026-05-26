//! CLI client for the `SimulatorBackdoor` gRPC endpoint.

use anyhow::Context;
use clap::Subcommand;

use crate::sim_proto::actuator_sim::{
    simulator_backdoor_client::SimulatorBackdoorClient,
    AmbientTempRequest, BackdoorEmpty, BackdoorResponse, ExternalTorqueRequest,
    FaultInjectionRequest, FaultKind, PlantStateRequest, StepSimRequest,
};

#[derive(Debug, Subcommand)]
pub enum SimCommand {
    /// Read ground-truth plant state (no encoder noise)
    Truth,
    /// Teleport the plant to an exact state; omitted fields keep their current values
    SetState {
        /// Position (rad)
        #[arg(long)]
        pos: Option<f64>,
        /// Velocity (rad/s)
        #[arg(long)]
        vel: Option<f64>,
        /// Motor current (A)
        #[arg(long)]
        current: Option<f64>,
        /// Winding temperature (°C)
        #[arg(long)]
        temp: Option<f64>,
    },
    /// Inject a latched fault [over-temperature | over-current | encoder-stuck]
    InjectFault { kind: String },
    /// Apply an external disturbance torque (N·m)
    ApplyTorque {
        torque: f64,
        /// Duration in milliseconds; 0 = indefinite until next call
        #[arg(long, default_value_t = 0)]
        duration_ms: u32,
    },
    /// Set ambient temperature for the thermal model (°C)
    SetAmbient { temperature: f64 },
    /// Pause the physics clock
    Pause,
    /// Resume the physics clock
    Resume,
    /// Advance sim by a fixed timestep in seconds (only valid while paused)
    Step { dt_s: f64 },
}

fn parse_fault(s: &str) -> anyhow::Result<FaultKind> {
    match s.to_lowercase().replace('-', "_").as_str() {
        "over_temperature" | "over_temp" => Ok(FaultKind::OverTemperature),
        "over_current" => Ok(FaultKind::OverCurrent),
        "encoder_stuck" => Ok(FaultKind::EncoderStuck),
        _ => anyhow::bail!(
            "Unknown fault '{s}'. Valid: over-temperature, over-current, encoder-stuck"
        ),
    }
}

fn print_backdoor(r: BackdoorResponse) {
    if r.ok {
        println!("ok");
    } else {
        println!("error: {}", r.message);
    }
}

pub async fn execute(addr: String, cmd: SimCommand) -> anyhow::Result<()> {
    let mut c = SimulatorBackdoorClient::connect(addr)
        .await
        .context("Cannot connect to simulator backdoor")?;

    match cmd {
        SimCommand::Truth => {
            let t = c.get_plant_truth(BackdoorEmpty {}).await?.into_inner();
            println!("position:    {:>12.4} rad", t.position);
            println!("velocity:    {:>12.4} rad/s", t.velocity);
            println!("current:     {:>12.4} A", t.current);
            println!("temperature: {:>12.4} °C", t.temperature);
            println!("sim_time:    {:>12.6} s", t.sim_time_s);
        }
        SimCommand::SetState { pos, vel, current, temp } => {
            // Read current truth so that unspecified fields keep their values
            // rather than silently resetting to 0.
            let truth = c.get_plant_truth(BackdoorEmpty {}).await?.into_inner();
            let r = c
                .set_plant_state(PlantStateRequest {
                    position:        pos.unwrap_or(truth.position),
                    velocity:        vel.unwrap_or(truth.velocity),
                    set_current:     current.is_some(),
                    current:         current.unwrap_or(truth.current),
                    set_temperature: temp.is_some(),
                    temperature:     temp.unwrap_or(truth.temperature),
                })
                .await?
                .into_inner();
            print_backdoor(r);
        }
        SimCommand::InjectFault { kind } => {
            let k = parse_fault(&kind)? as i32;
            print_backdoor(c.inject_fault(FaultInjectionRequest { kind: k }).await?.into_inner());
        }
        SimCommand::ApplyTorque { torque, duration_ms } => {
            print_backdoor(
                c.apply_external_torque(ExternalTorqueRequest { torque, duration_ms })
                    .await?
                    .into_inner(),
            );
        }
        SimCommand::SetAmbient { temperature } => {
            print_backdoor(
                c.set_ambient_temperature(AmbientTempRequest { temperature })
                    .await?
                    .into_inner(),
            );
        }
        SimCommand::Pause => {
            print_backdoor(c.pause_sim(BackdoorEmpty {}).await?.into_inner());
        }
        SimCommand::Resume => {
            print_backdoor(c.resume_sim(BackdoorEmpty {}).await?.into_inner());
        }
        SimCommand::Step { dt_s } => {
            print_backdoor(c.step_sim(StepSimRequest { dt_s }).await?.into_inner());
        }
    }

    Ok(())
}
