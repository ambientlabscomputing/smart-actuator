mod config;
mod grpc;
mod logging;

use std::sync::Arc;

use actuator_core::AppService;
use clap::{Parser, Subcommand};
use tokio::signal;
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
    Run,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Run => run().await,
    }
}

async fn run() -> anyhow::Result<()> {
    let config_path = config::config_path();
    let config = config::load(&config_path)?;

    logging::setup(&config.log_settings);

    info!(
        config = config_path,
        id = config.identity.id,
        name = config.identity.name,
        "actuator simulator starting"
    );

    let service: Arc<dyn actuator_core::Service> = Arc::new(AppService::new());
    service.start().await;

    let shutdown = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl-C handler");
        info!("shutdown signal received");
    };

    grpc::serve(&config.grpc, service.clone(), shutdown).await?;

    service.stop().await;
    info!("shutdown complete");

    Ok(())
}
