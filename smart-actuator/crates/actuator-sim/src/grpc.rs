use std::sync::Arc;

use actuator_core::{types as domain, Service};
use actuator_proto::actuator::{
    actuator_service_server::{ActuatorService, ActuatorServiceServer},
    ClockResponse, CommandResponse, CurrentResponse, PositionResponse, ReadRequest,
    SetControlModeRequest, SetCurrentLimitRequest, SetPositionRequest, SetSoftLimitsRequest,
    SetTemperatureLimitRequest, SetTorqueRequest, SetVelocityRequest, TemperatureResponse,
    TrackingErrorResponse, TrajectorySegmentRequest, VelocityResponse,
};
use tonic::{Request, Response, Status};
use tracing::info;

use crate::config::GrpcConfig;

/// Maps a domain `CommandResponse` to the proto wire type, including the
/// typed `refusal_code` field.
fn to_proto_cmd(r: domain::CommandResponse) -> CommandResponse {
    CommandResponse {
        success: r.success,
        message: r.message,
        refusal_code: match r.refusal {
            None => 0, // REFUSAL_CODE_NONE
            Some(domain::RefusalReason::OutsideSoftLimits) => 1,
            Some(domain::RefusalReason::WrongControlMode) => 2,
            Some(domain::RefusalReason::OverTemperature) => 3,
            Some(domain::RefusalReason::FaultLatched) => 4,
            Some(domain::RefusalReason::NotImplemented) => 5,
            Some(domain::RefusalReason::TrajectoryRunning) => 6,
            Some(domain::RefusalReason::InvalidTrajectory) => 7,
        },
    }
}

/// Maps the proto `ControlModeProto` int32 to the domain `ControlMode`.
fn to_domain_mode(mode: i32) -> domain::ControlMode {
    match mode {
        0 => domain::ControlMode::Position,
        1 => domain::ControlMode::Velocity,
        2 => domain::ControlMode::Torque,
        3 => domain::ControlMode::Impedance,
        _ => domain::ControlMode::Position,
    }
}

/// Adapts `actuator_core::Service` to the tonic-generated `ActuatorService` trait.
struct Servicer {
    inner: Arc<dyn Service>,
}

#[tonic::async_trait]
impl ActuatorService for Servicer {
    // ── Level 1: commands ─────────────────────────────────────────────────────

    async fn set_position(
        &self,
        request: Request<SetPositionRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.set_position(request.into_inner().angle).await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn set_velocity(
        &self,
        request: Request<SetVelocityRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.set_velocity(request.into_inner().velocity).await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn set_torque(
        &self,
        request: Request<SetTorqueRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.set_torque(request.into_inner().torque).await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    // ── Level 1: telemetry ────────────────────────────────────────────────────

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

    // ── Level 2: safety ───────────────────────────────────────────────────────

    async fn set_soft_limits(
        &self,
        request: Request<SetSoftLimitsRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let req = request.into_inner();
        let r = self.inner.set_soft_limits(req.min, req.max).await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn set_current_limit(
        &self,
        request: Request<SetCurrentLimitRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.set_current_limit(request.into_inner().max_current).await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn set_temperature_limit(
        &self,
        request: Request<SetTemperatureLimitRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self
            .inner
            .set_temperature_limit(request.into_inner().max_temperature)
            .await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn set_control_mode(
        &self,
        request: Request<SetControlModeRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let mode = to_domain_mode(request.into_inner().mode);
        let r = self.inner.set_control_mode(mode).await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn clear_fault(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let r = self.inner.clear_fault().await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn read_temperature(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<TemperatureResponse>, Status> {
        let r = self.inner.read_temperature().await;
        Ok(Response::new(TemperatureResponse { temperature: r.temperature }))
    }

    // ── Level 3: trajectory ───────────────────────────────────────────────────

    async fn execute_trajectory_segment(
        &self,
        request: Request<TrajectorySegmentRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let req = request.into_inner();
        let segment = domain::TrajectorySegment {
            start_time_s: req.start_time_s,
            points: req
                .points
                .into_iter()
                .map(|p| domain::TrajectoryPoint {
                    time_s: p.time_s,
                    position: p.position,
                    velocity: p.velocity,
                    torque_ff: p.torque_ff,
                })
                .collect(),
        };
        let r = self.inner.execute_trajectory_segment(segment).await;
        Ok(Response::new(to_proto_cmd(r)))
    }

    async fn pause(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        Ok(Response::new(to_proto_cmd(self.inner.pause().await)))
    }

    async fn resume(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        Ok(Response::new(to_proto_cmd(self.inner.resume().await)))
    }

    async fn abort(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        Ok(Response::new(to_proto_cmd(self.inner.abort().await)))
    }

    async fn report_tracking_error(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<TrackingErrorResponse>, Status> {
        let r = self.inner.report_tracking_error().await;
        Ok(Response::new(TrackingErrorResponse {
            instantaneous: r.instantaneous,
            max_since_start: r.max_since_start,
            rms: r.rms,
        }))
    }

    async fn get_clock(
        &self,
        _request: Request<ReadRequest>,
    ) -> Result<Response<ClockResponse>, Status> {
        Ok(Response::new(ClockResponse { sim_time_s: self.inner.get_clock().await }))
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
