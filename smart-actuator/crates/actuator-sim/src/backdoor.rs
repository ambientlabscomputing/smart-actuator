use std::sync::Arc;

use tonic::{Request, Response, Status};
use tracing::info;

use crate::plant::{SimFaultKind, SimPlant};
use crate::sim_proto::actuator_sim::{
    simulator_backdoor_server::{SimulatorBackdoor, SimulatorBackdoorServer},
    AmbientTempRequest, BackdoorEmpty, BackdoorResponse, ExternalTorqueRequest,
    FaultInjectionRequest, FaultKind, PlantStateRequest, PlantTruth, StepSimRequest,
};

struct Backdoor {
    plant: Arc<SimPlant>,
}

fn ok(msg: impl Into<String>) -> Response<BackdoorResponse> {
    Response::new(BackdoorResponse { ok: true, message: msg.into() })
}

fn err(msg: impl Into<String>) -> Response<BackdoorResponse> {
    Response::new(BackdoorResponse { ok: false, message: msg.into() })
}

#[tonic::async_trait]
impl SimulatorBackdoor for Backdoor {
    async fn set_plant_state(
        &self,
        request: Request<PlantStateRequest>,
    ) -> Result<Response<BackdoorResponse>, Status> {
        let r = request.into_inner();
        let current = if r.set_current { Some(r.current) } else { None };
        let temperature = if r.set_temperature { Some(r.temperature) } else { None };
        self.plant.set_plant_state(r.position, r.velocity, current, temperature).await;
        Ok(ok("Plant state set"))
    }

    async fn apply_external_torque(
        &self,
        request: Request<ExternalTorqueRequest>,
    ) -> Result<Response<BackdoorResponse>, Status> {
        let r = request.into_inner();
        self.plant.apply_external_torque(r.torque, r.duration_ms).await;
        Ok(ok(format!("External torque {:.3} N·m applied", r.torque)))
    }

    async fn set_ambient_temperature(
        &self,
        request: Request<AmbientTempRequest>,
    ) -> Result<Response<BackdoorResponse>, Status> {
        self.plant.set_ambient_temperature(request.into_inner().temperature).await;
        Ok(ok("Ambient temperature set"))
    }

    async fn inject_fault(
        &self,
        request: Request<FaultInjectionRequest>,
    ) -> Result<Response<BackdoorResponse>, Status> {
        let kind = match FaultKind::try_from(request.into_inner().kind) {
            Ok(FaultKind::OverTemperature) => SimFaultKind::OverTemperature,
            Ok(FaultKind::OverCurrent) => SimFaultKind::OverCurrent,
            Ok(FaultKind::EncoderStuck) => SimFaultKind::EncoderStuck,
            Err(_) => return Ok(err("Unknown fault kind")),
        };
        self.plant.inject_fault(kind).await;
        Ok(ok("Fault injected"))
    }

    async fn pause_sim(
        &self,
        _request: Request<BackdoorEmpty>,
    ) -> Result<Response<BackdoorResponse>, Status> {
        self.plant.pause().await;
        Ok(ok("Sim paused"))
    }

    async fn resume_sim(
        &self,
        _request: Request<BackdoorEmpty>,
    ) -> Result<Response<BackdoorResponse>, Status> {
        self.plant.resume().await;
        Ok(ok("Sim resumed"))
    }

    async fn step_sim(
        &self,
        request: Request<StepSimRequest>,
    ) -> Result<Response<BackdoorResponse>, Status> {
        let dt = request.into_inner().dt_s;
        if dt <= 0.0 {
            return Ok(err("dt_s must be positive"));
        }
        self.plant.step(dt).await;
        Ok(ok(format!("Sim stepped by {dt:.6} s")))
    }

    async fn get_plant_truth(
        &self,
        _request: Request<BackdoorEmpty>,
    ) -> Result<Response<PlantTruth>, Status> {
        let t = self.plant.get_truth().await;
        Ok(Response::new(PlantTruth {
            position: t.position,
            velocity: t.velocity,
            current: t.current,
            temperature: t.temperature,
            sim_time_s: t.sim_time_s,
        }))
    }
}

/// Run the backdoor gRPC server until `shutdown` resolves.
pub async fn serve(
    plant: Arc<SimPlant>,
    addr: String,
    shutdown: impl std::future::Future<Output = ()>,
) -> anyhow::Result<()> {
    let addr: std::net::SocketAddr = addr.parse()?;
    let svc = Backdoor { plant };
    info!("Simulator backdoor listening on {}", addr);
    tonic::transport::Server::builder()
        .add_service(SimulatorBackdoorServer::new(svc))
        .serve_with_shutdown(addr, shutdown)
        .await?;
    Ok(())
}
