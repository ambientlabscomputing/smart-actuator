use std::sync::Arc;

use actuator_core::Service;
use actuator_proto::actuator::{
    actuator_service_server::{ActuatorService, ActuatorServiceServer},
    CommandResponse, CurrentResponse, PositionResponse, ReadRequest, SetPositionRequest,
    SetTorqueRequest, SetVelocityRequest, VelocityResponse,
};
use tonic::{Request, Response, Status};
use tracing::info;

use crate::config::GrpcConfig;

/// Adapts `actuator_core::Service` to the tonic-generated `ActuatorService` trait.
/// Translates proto messages → domain calls → proto responses.
struct Servicer {
    inner: Arc<dyn Service>,
}

#[tonic::async_trait]
impl ActuatorService for Servicer {
    async fn set_position(
        &self,
        request: Request<SetPositionRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.set_position(request.into_inner().angle).await;
        Ok(Response::new(CommandResponse {
            success: r.success,
            message: r.message,
        }))
    }

    async fn set_velocity(
        &self,
        request: Request<SetVelocityRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.set_velocity(request.into_inner().velocity).await;
        Ok(Response::new(CommandResponse {
            success: r.success,
            message: r.message,
        }))
    }

    async fn set_torque(
        &self,
        request: Request<SetTorqueRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.set_torque(request.into_inner().torque).await;
        Ok(Response::new(CommandResponse {
            success: r.success,
            message: r.message,
        }))
    }

    async fn read_position(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<PositionResponse>, Status> {
        let r = self.inner.read_position().await;
        Ok(Response::new(PositionResponse { angle: r.angle }))
    }

    async fn read_velocity(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<VelocityResponse>, Status> {
        let r = self.inner.read_velocity().await;
        Ok(Response::new(VelocityResponse { velocity: r.velocity }))
    }

    async fn read_current(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<CurrentResponse>, Status> {
        let r = self.inner.read_current().await;
        Ok(Response::new(CurrentResponse { current: r.current }))
    }
}

/// Build and run the gRPC server until `shutdown` resolves.
pub async fn serve(
    config: &GrpcConfig,
    service: Arc<dyn Service>,
    shutdown: impl std::future::Future<Output = ()>,
) -> anyhow::Result<()> {
    let addr = format!("{}:{}", config.host, config.port).parse()?;
    let servicer = Servicer { inner: service };

    info!("gRPC server listening on {}", addr);

    tonic::transport::Server::builder()
        .add_service(ActuatorServiceServer::new(servicer))
        .serve_with_shutdown(addr, shutdown)
        .await?;

    Ok(())
}
