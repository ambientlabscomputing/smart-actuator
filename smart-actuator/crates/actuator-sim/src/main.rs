mod backdoor;
mod cmd;
mod config;
mod grpc;
mod logging;
mod plant;
mod sim_cmd;
mod sim_proto;

use std::sync::Arc;
use std::time::Duration;

use actuator_core::{AppService, Service};
use clap::{Parser, Subcommand};
use plant::{PlantParams, SimPlant};
use tracing::info;

#[derive(Parser)]
#[command(name = "actuator-sim", about = "Ambient Labs actuator simulator")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the actuator simulator gRPC service
    Run {
        /// Detach from the terminal and run in the background.
        /// Requires log_to_stderr = false in config so logs go to the log file.
        #[arg(short, long)]
        detached: bool,
    },
    /// Stop a running actuator simulator by sending SIGTERM via its PID file
    Stop,
    /// Send a command to the actuator service (port from config)
    Cmd {
        #[command(subcommand)]
        command: cmd::CmdCommand,
    },
    /// Interact with the simulator backdoor (port from config)
    Sim {
        #[command(subcommand)]
        command: sim_cmd::SimCommand,
    },
}

/// Outer main is intentionally synchronous: the fork for detached mode must
/// happen before the Tokio runtime is created (forking a multi-threaded process
/// is unsafe).
fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Config is always loaded first — both Run and Stop need it.
    let config_path = config::config_path();
    let config = config::load(&config_path)?;

    match cli.command {
        Commands::Run { detached } => {
            if detached {
                detach(&config, &config_path)?;
            }
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()?
                .block_on(run(config, config_path))
        }
        Commands::Stop => stop(&config.pid_file),
        Commands::Cmd { command } => {
            let addr = format!("http://{}:{}", config.grpc.host, config.grpc.port);
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?
                .block_on(cmd::execute(addr, command))
        }
        Commands::Sim { command } => {
            let addr = format!("http://{}:{}", config.grpc.host, config.grpc.backdoor_port);
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?
                .block_on(sim_cmd::execute(addr, command))
        }
    }
}

/// Fork and detach from the controlling terminal (Unix only).
#[cfg(unix)]
fn detach(config: &config::ActuatorConfig, config_path: &str) -> anyhow::Result<()> {
    use daemonize::{Daemonize, Outcome};
    let cwd = std::env::current_dir()?;

    let log_sink = if config.log_settings.log_to_stderr {
        "stderr (warning: will be lost after detach)".to_owned()
    } else {
        config.log_settings.file.clone()
    };
    let backdoor_line = if config.grpc.enable_backdoor {
        format!("{}:{}", config.grpc.host, config.grpc.backdoor_port)
    } else {
        "disabled".to_owned()
    };
    let msg = format!(
        "actuator-sim detached\n  identity : {} ({})\n  gRPC     : {}:{}\n  backdoor : {}\n  log      : {}\n  pid file : {}\n  config   : {}",
        config.identity.name,
        config.identity.id,
        config.grpc.host,
        config.grpc.port,
        backdoor_line,
        log_sink,
        config.pid_file,
        config_path,
    );

    match Daemonize::new().working_directory(cwd).execute() {
        Outcome::Parent(Ok(_)) => {
            eprintln!("{msg}");
            std::process::exit(0);
        }
        Outcome::Parent(Err(e)) => anyhow::bail!("Failed to detach: {e}"),
        Outcome::Child(Ok(_)) => Ok(()), // child continues into run()
        Outcome::Child(Err(e)) => anyhow::bail!("Failed to initialize daemon: {e}"),
    }
}

#[cfg(not(unix))]
fn detach(_config: &config::ActuatorConfig, _config_path: &str) -> anyhow::Result<()> {
    anyhow::bail!("--detached / -d is not supported on this platform")
}

/// Removes the PID file when dropped (i.e. on any exit path).
struct PidGuard(String);
impl Drop for PidGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Send SIGTERM to the process named in the PID file (Unix only).
#[cfg(unix)]
fn stop(pid_file: &str) -> anyhow::Result<()> {
    use nix::sys::signal::{Signal, kill};
    use nix::unistd::Pid;

    let raw = std::fs::read_to_string(pid_file).map_err(|_| {
        anyhow::anyhow!("PID file not found at '{pid_file}'\nIs actuator-sim running?")
    })?;
    let pid: i32 = raw.trim().parse().map_err(|_| {
        anyhow::anyhow!("Malformed PID file '{pid_file}': {:?}", raw.trim())
    })?;

    kill(Pid::from_raw(pid), Signal::SIGTERM)
        .map_err(|e| anyhow::anyhow!("Failed to send SIGTERM to process {pid}: {e}"))?;

    eprintln!("actuator-sim: sent SIGTERM to process {pid}");
    Ok(())
}

#[cfg(not(unix))]
fn stop(_pid_file: &str) -> anyhow::Result<()> {
    anyhow::bail!("stop is not supported on this platform")
}

async fn run(config: config::ActuatorConfig, config_path: String) -> anyhow::Result<()> {
    // Keep the guard alive for the process lifetime — dropping it flushes the log sink.
    let _log_guard = logging::setup(&config.log_settings);

    info!(
        config = config_path,
        id = config.identity.id,
        name = config.identity.name,
        "actuator simulator starting"
    );

    // Build the SimPlant from config
    let params = PlantParams {
        inertia: config.physics.inertia,
        damping: config.physics.damping,
        encoder_noise_std: config.physics.encoder_noise_std,
        kp_pos: config.physics.kp_pos,
        kd_pos: config.physics.kd_pos,
        kp_vel: config.physics.kp_vel,
        kt: config.physics.kt,
        thermal_resistance: config.physics.thermal_resistance,
        thermal_capacitance: config.physics.thermal_capacitance,
    };
    let plant = SimPlant::new(params);

    // AppService wraps the plant via the Hardware trait
    let service = Arc::new(AppService::new(plant.clone()));
    service.start().await;

    // Write PID file; guard removes it on any exit path (clean shutdown or panic).
    std::fs::write(&config.pid_file, format!("{}", std::process::id()))
        .map_err(|e| anyhow::anyhow!("Cannot write PID file '{}': {e}", config.pid_file))?;
    let _pid_guard = PidGuard(config.pid_file.clone());
    info!(pid_file = config.pid_file, "PID file written");

    // Physics tick task — runs AppService::tick then SimPlant::tick at `tick_hz`
    let tick_dt = 1.0 / config.physics.tick_hz;
    {
        let tick_service = service.clone();
        let tick_plant = plant.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs_f64(tick_dt));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                interval.tick().await;
                // 1. Advance control state and apply setpoint to plant
                tick_service.tick(tick_dt).await;
                // 2. Integrate plant dynamics
                tick_plant.tick(tick_dt).await;
            }
        });
    }

    // Optional backdoor server
    if config.grpc.enable_backdoor {
        let bd_plant = plant.clone();
        let bd_addr = format!("{}:{}", config.grpc.host, config.grpc.backdoor_port);
        tokio::spawn(async move {
            if let Err(e) = backdoor::serve(bd_plant, bd_addr, std::future::pending()).await {
                tracing::error!("Backdoor server error: {e}");
            }
        });
    }

    // Main gRPC server — shuts down on SIGINT or SIGTERM (SIGTERM is sent by `stop`).
    let service_ref: Arc<dyn actuator_core::Service> = service.clone();
    let shutdown = async {
        #[cfg(unix)]
        {
            use tokio::signal::unix::{SignalKind, signal as unix_signal};
            let mut sigterm = unix_signal(SignalKind::terminate())
                .expect("failed to install SIGTERM handler");
            let mut sigint = unix_signal(SignalKind::interrupt())
                .expect("failed to install SIGINT handler");
            tokio::select! {
                _ = sigterm.recv() => info!("SIGTERM received"),
                _ = sigint.recv()  => info!("SIGINT received"),
            }
        }
        #[cfg(not(unix))]
        {
            signal::ctrl_c().await.expect("failed to install Ctrl-C handler");
            info!("shutdown signal received");
        }
    };

    grpc::serve(&config.grpc, service_ref, shutdown).await?;

    service.stop().await;
    info!("shutdown complete");

    Ok(())
}

