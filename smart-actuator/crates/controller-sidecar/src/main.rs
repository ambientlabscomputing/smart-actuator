mod aggregator;
mod client_pool;
mod config;
mod discovery;
mod estop;
mod grpc;
mod logging;
mod types;
mod watchdog;

use clap::{Parser, Subcommand};
use discovery::Discovery;
use estop::EStopBroadcaster;
use grpc::sidecar_proto::sidecar_service_server::SidecarServiceServer;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{watch, Mutex};
use tracing::info;

#[derive(Parser)]
#[command(name = "controller-sidecar", about = "Ambient Labs controller sidecar")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the sidecar gRPC service
    Run {
        /// Detach from the terminal and run in the background.
        /// Requires log_to_stderr = false in config.
        #[arg(short, long)]
        detached: bool,
    },
    /// Stop a running sidecar by sending SIGTERM via its PID file
    Stop,
}

/// Outer main is synchronous: the fork for detached mode must happen before
/// the Tokio runtime is created (forking a multi-threaded process is unsafe).
fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    let config_path = config::config_path();
    let cfg = config::load(&config_path)?;

    match cli.command {
        Commands::Run { detached } => {
            if detached {
                detach(&cfg, &config_path)?;
            }
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()?
                .block_on(run(cfg, config_path))
        }
        Commands::Stop => stop(&cfg.pid_file),
    }
}

/// Fork and detach from the controlling terminal (Unix only).
#[cfg(unix)]
fn detach(cfg: &config::SidecarConfig, config_path: &str) -> anyhow::Result<()> {
    use daemonize::{Daemonize, Outcome};
    let cwd = std::env::current_dir()?;

    let socket = cfg
        .listen
        .socket_path
        .as_deref()
        .unwrap_or("tcp")
        .to_owned();
    let msg = format!(
        "controller-sidecar detached\n  socket   : {}\n  pid file : {}\n  config   : {}",
        socket, cfg.pid_file, config_path
    );

    match Daemonize::new().working_directory(cwd).execute() {
        Outcome::Parent(Ok(_)) => {
            eprintln!("{msg}");
            std::process::exit(0);
        }
        Outcome::Parent(Err(e)) => anyhow::bail!("Failed to detach: {e}"),
        Outcome::Child(Ok(_)) => Ok(()),
        Outcome::Child(Err(e)) => anyhow::bail!("Failed to initialize daemon: {e}"),
    }
}

#[cfg(not(unix))]
fn detach(_cfg: &config::SidecarConfig, _config_path: &str) -> anyhow::Result<()> {
    anyhow::bail!("--detached / -d is not supported on this platform")
}

/// Send SIGTERM to the process named in the PID file (Unix only).
#[cfg(unix)]
fn stop(pid_file: &str) -> anyhow::Result<()> {
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;

    let raw = std::fs::read_to_string(pid_file).map_err(|_| {
        anyhow::anyhow!("PID file not found at '{pid_file}'\nIs controller-sidecar running?")
    })?;
    let pid: i32 = raw
        .trim()
        .parse()
        .map_err(|_| anyhow::anyhow!("Malformed PID file '{pid_file}': {:?}", raw.trim()))?;

    kill(Pid::from_raw(pid), Signal::SIGTERM)
        .map_err(|e| anyhow::anyhow!("Failed to send SIGTERM to process {pid}: {e}"))?;
    eprintln!("controller-sidecar: sent SIGTERM to process {pid}");
    Ok(())
}

#[cfg(not(unix))]
fn stop(_pid_file: &str) -> anyhow::Result<()> {
    anyhow::bail!("stop is not supported on this platform")
}

struct PidGuard(String);
impl Drop for PidGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

async fn run(cfg: config::SidecarConfig, config_path: String) -> anyhow::Result<()> {
    let _log_guard = logging::setup(&cfg.log_settings);

    info!(config = config_path, "controller-sidecar starting");

    // ── Discovery ──────────────────────────────────────────────────────────
    let discovery = Discovery::new(cfg.discovery);
    let endpoints = discovery.discover();
    info!("{} actuator(s) discovered", endpoints.len());

    // ── Client pool ────────────────────────────────────────────────────────
    let pool = client_pool::ActuatorClientPool::connect(endpoints).await;
    let pool = Arc::new(Mutex::new(pool));

    // ── E-stop broadcaster ─────────────────────────────────────────────────
    let estop = Arc::new(EStopBroadcaster::new(pool.clone()));

    // ── Watchdog ───────────────────────────────────────────────────────────
    let heartbeat = watchdog::HeartbeatHandle::new();
    let watchdog = watchdog::Watchdog::new(heartbeat.clone(), estop.clone(), cfg.watchdog);

    // ── Aggregator ─────────────────────────────────────────────────────────
    let aggregator = Arc::new(aggregator::JointStateAggregator::new(
        pool.clone(),
        Duration::from_millis(10), // 100 Hz default — TODO: make configurable
    ));

    // ── Cancellation channel ───────────────────────────────────────────────
    let (cancel_tx, cancel_rx) = watch::channel(false);

    // Spawn background tasks
    {
        let rx = cancel_rx.clone();
        let agg = aggregator.clone();
        tokio::spawn(async move { agg.run(rx).await });
    }
    {
        let rx = cancel_rx.clone();
        tokio::spawn(async move { watchdog.run(rx).await });
    }

    // ── PID file ───────────────────────────────────────────────────────────
    std::fs::write(&cfg.pid_file, format!("{}", std::process::id()))
        .map_err(|e| anyhow::anyhow!("Cannot write PID file '{}': {e}", cfg.pid_file))?;
    let _pid_guard = PidGuard(cfg.pid_file.clone());
    info!(pid_file = cfg.pid_file, "PID file written");

    // ── gRPC server ────────────────────────────────────────────────────────
    let servicer = grpc::SidecarServicer::new(pool, aggregator, estop, heartbeat);
    let svc = SidecarServiceServer::new(servicer);

    // Signal handler
    let shutdown = async {
        #[cfg(unix)]
        {
            use tokio::signal::unix::{signal as unix_signal, SignalKind};
            let mut sigterm =
                unix_signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
            let mut sigint =
                unix_signal(SignalKind::interrupt()).expect("failed to install SIGINT handler");
            tokio::select! {
                _ = sigterm.recv() => info!("SIGTERM received"),
                _ = sigint.recv()  => info!("SIGINT received"),
            }
        }
        #[cfg(not(unix))]
        {
            tokio::signal::ctrl_c().await.expect("failed to install Ctrl-C handler");
            info!("shutdown signal received");
        }
    };

    // Listen on Unix socket or TCP
    if let Some(socket_path) = &cfg.listen.socket_path {
        use tokio::net::UnixListener;
        use tokio_stream::wrappers::UnixListenerStream;

        // Remove stale socket if present
        let _ = std::fs::remove_file(socket_path);

        let listener = UnixListener::bind(socket_path)
            .map_err(|e| anyhow::anyhow!("Cannot bind Unix socket {socket_path}: {e}"))?;
        let incoming = UnixListenerStream::new(listener);

        info!(socket = socket_path, "Listening on Unix socket");

        tonic::transport::Server::builder()
            .add_service(svc)
            .serve_with_incoming_shutdown(incoming, shutdown)
            .await?;
    } else {
        let addr = format!("{}:{}", cfg.listen.host, cfg.listen.port)
            .parse()
            .map_err(|e| anyhow::anyhow!("Invalid listen address: {e}"))?;

        info!(%addr, "Listening on TCP");

        tonic::transport::Server::builder()
            .add_service(svc)
            .serve_with_shutdown(addr, shutdown)
            .await?;
    }

    // Signal background tasks to stop
    let _ = cancel_tx.send(true);
    info!("controller-sidecar stopped");
    Ok(())
}
