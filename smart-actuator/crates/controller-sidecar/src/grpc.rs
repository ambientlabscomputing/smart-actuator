//! gRPC servicer — implements SidecarService for the Brain.

use crate::aggregator::JointStateAggregator;
use crate::client_pool::ActuatorClientPool;
use crate::estop::EStopBroadcaster;
use crate::watchdog::HeartbeatHandle;
use actuator_proto::actuator::{ReadRequest, SetPositionRequest, TrajectorySegmentRequest};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use tonic::{Request, Response, Status};
use tracing::{info, warn};

// Generated types — available after `cargo build -p controller-sidecar`.
pub mod sidecar_proto {
    tonic::include_proto!("sidecar");
}

use sidecar_proto::{
    sidecar_service_server::SidecarService,
    ActuatorInfo, ActuatorRequest, CalibrateActuatorRequest, CalibrateActuatorResponse,
    CommandResponse, EStopRequest, GetJointStatesRequest, HeartbeatRequest, HeartbeatResponse,
    JointState, JointStateBatch, ListActuatorsRequest, ListActuatorsResponse,
    SendCommandRequest, SendTrajectoryRequest, StreamJointStatesRequest,
};

fn now_ns() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as i64
}

pub struct SidecarServicer {
    pool: Arc<Mutex<ActuatorClientPool>>,
    aggregator: Arc<JointStateAggregator>,
    estop: Arc<EStopBroadcaster>,
    heartbeat: HeartbeatHandle,
}

impl SidecarServicer {
    pub fn new(
        pool: Arc<Mutex<ActuatorClientPool>>,
        aggregator: Arc<JointStateAggregator>,
        estop: Arc<EStopBroadcaster>,
        heartbeat: HeartbeatHandle,
    ) -> Self {
        Self { pool, aggregator, estop, heartbeat }
    }
}

#[tonic::async_trait]
impl SidecarService for SidecarServicer {
    // ── Discovery ──────────────────────────────────────────────────────────

    async fn list_actuators(
        &self,
        _request: Request<ListActuatorsRequest>,
    ) -> Result<Response<ListActuatorsResponse>, Status> {
        let pool = self.pool.lock().await;
        let actuators = pool
            .live_endpoints()
            .iter()
            .map(|ep| ActuatorInfo {
                id: ep.id.clone(),
                address: ep.address.clone(),
                joint_name: ep.joint_name.clone(),
                is_simulated: ep.is_simulated,
                health: "unknown".into(), // TODO: track per-actuator health
            })
            .collect();
        Ok(Response::new(ListActuatorsResponse { actuators }))
    }

    // ── State ──────────────────────────────────────────────────────────────

    async fn get_joint_states(
        &self,
        _request: Request<GetJointStatesRequest>,
    ) -> Result<Response<JointStateBatch>, Status> {
        let mut pool = self.pool.lock().await;
        let mut joints = Vec::new();

        for (id, client) in pool.iter_mut() {
            let req = Request::new(ReadRequest {});
            match client.read_position(req).await {
                Ok(resp) => {
                    let pos = resp.into_inner();
                    joints.push(JointState {
                        actuator_id: id.clone(),
                        joint_name: id.clone(),
                        angle_rad: pos.angle,
                        velocity_rad_s: 0.0,
                        current_a: 0.0,
                        fault: String::new(),
                    });
                }
                Err(e) => {
                    warn!(actuator_id = %id, error = %e, "get_joint_states: read failed");
                    joints.push(JointState {
                        actuator_id: id.clone(),
                        joint_name: id.clone(),
                        angle_rad: 0.0,
                        velocity_rad_s: 0.0,
                        current_a: 0.0,
                        fault: e.to_string(),
                    });
                }
            }
        }

        Ok(Response::new(JointStateBatch { joints, timestamp: now_ns() }))
    }

    type StreamJointStatesStream = std::pin::Pin<
        Box<dyn futures::Stream<Item = Result<JointStateBatch, Status>> + Send + 'static>,
    >;

    async fn stream_joint_states(
        &self,
        _request: Request<StreamJointStatesRequest>,
    ) -> Result<Response<Self::StreamJointStatesStream>, Status> {
        use tokio_stream::wrappers::BroadcastStream;
        use tokio_stream::StreamExt;

        info!("stream_joint_states: client subscribed");
        let rx = self.aggregator.subscribe();
        let stream = BroadcastStream::new(rx).filter_map(|result| match result {
            Ok(snapshots) => {
                let joints = snapshots
                    .into_iter()
                    .map(|s| JointState {
                        actuator_id: s.actuator_id,
                        joint_name: s.joint_name,
                        angle_rad: s.angle_rad,
                        velocity_rad_s: s.velocity_rad_s,
                        current_a: s.current_a,
                        fault: s.fault.unwrap_or_default(),
                    })
                    .collect();
                Some(Ok(JointStateBatch { joints, timestamp: now_ns() }))
            }
            Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(n)) => {
                tracing::warn!(frames = n, "stream_joint_states: slow consumer lagged");
                None
            }
        });
        Ok(Response::new(Box::pin(stream)))
    }

    // ── Motion ─────────────────────────────────────────────────────────────

    async fn send_trajectory_segments(
        &self,
        request: Request<SendTrajectoryRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let req = request.into_inner();
        let mut pool = self.pool.lock().await;
        let mut errors: Vec<String> = Vec::new();

        for seg in req.segments {
            let client = pool.get_mut(&seg.actuator_id).ok_or_else(|| {
                Status::not_found(format!("actuator {} not found", seg.actuator_id))
            })?;

            // Convert sidecar TrajectoryPoint → actuator TrajectorySegmentRequest.
            // Mapping is approximate — adjust to match the actuator proto fields.
            let points = seg
                .points
                .iter()
                .map(|p| actuator_proto::actuator::TrajectoryPoint {
                    time_s: p.time_from_start_s,
                    position: p.position_rad,
                    velocity: p.velocity_rad_s,
                    torque_ff: p.torque_ff_nm,
                })
                .collect();

            let traj_req = Request::new(TrajectorySegmentRequest {
                start_time_s: seg.start_time_ns as f64 / 1e9,
                points,
            });

            match client.execute_trajectory_segment(traj_req).await {
                Ok(resp) => {
                    let r = resp.into_inner();
                    if !r.success {
                        errors.push(format!("{}: {}", seg.actuator_id, r.message));
                    }
                }
                Err(e) => {
                    errors.push(format!("{}: {}", seg.actuator_id, e));
                }
            }
        }

        if errors.is_empty() {
            Ok(Response::new(CommandResponse { success: true, message: String::new(), refusal_code: 0 }))
        } else {
            Ok(Response::new(CommandResponse {
                success: false,
                message: errors.join("; "),
                refusal_code: 0,
            }))
        }
    }

    async fn pause(
        &self,
        request: Request<ActuatorRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let id = request.into_inner().actuator_id;
        let mut pool = self.pool.lock().await;
        let client = pool
            .get_mut(&id)
            .ok_or_else(|| Status::not_found(format!("actuator {id} not found")))?;

        let req = Request::new(ReadRequest {});
        client
            .pause(req)
            .await
            .map(|r| {
                let inner = r.into_inner();
                Response::new(CommandResponse { success: inner.success, message: inner.message, refusal_code: 0 })
            })
            .map_err(|e| Status::internal(e.to_string()))
    }

    async fn resume(
        &self,
        request: Request<ActuatorRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let id = request.into_inner().actuator_id;
        let mut pool = self.pool.lock().await;
        let client = pool
            .get_mut(&id)
            .ok_or_else(|| Status::not_found(format!("actuator {id} not found")))?;

        let req = Request::new(ReadRequest {});
        client
            .resume(req)
            .await
            .map(|r| {
                let inner = r.into_inner();
                Response::new(CommandResponse { success: inner.success, message: inner.message, refusal_code: 0 })
            })
            .map_err(|e| Status::internal(e.to_string()))
    }

    async fn abort(
        &self,
        request: Request<ActuatorRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let id = request.into_inner().actuator_id;
        let mut pool = self.pool.lock().await;
        let client = pool
            .get_mut(&id)
            .ok_or_else(|| Status::not_found(format!("actuator {id} not found")))?;

        let req = Request::new(ReadRequest {});
        client
            .abort(req)
            .await
            .map(|r| {
                let inner = r.into_inner();
                Response::new(CommandResponse { success: inner.success, message: inner.message, refusal_code: 0 })
            })
            .map_err(|e| Status::internal(e.to_string()))
    }

    // ── Safety ─────────────────────────────────────────────────────────────

    async fn e_stop(
        &self,
        _request: Request<EStopRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        info!("EStop RPC received from Brain");
        self.estop.broadcast("brain rpc").await;
        Ok(Response::new(CommandResponse { success: true, message: String::new(), refusal_code: 0 }))
    }

    async fn send_command(
        &self,
        request: Request<SendCommandRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        // Gate: reject commands when the Brain's heartbeat has timed out.
        if !self.heartbeat.is_armed() {
            warn!("SendCommand rejected — watchdog disarmed (Brain heartbeat lost)");
            return Ok(Response::new(CommandResponse {
                success: false,
                message: "watchdog stale — Brain heartbeat lost".into(),
                refusal_code: 8, // REFUSAL_CODE_WATCHDOG_STALE
            }));
        }

        let req = request.into_inner();
        let mut pool = self.pool.lock().await;
        let client = pool
            .get_mut(&req.actuator_id)
            .ok_or_else(|| Status::not_found(format!("actuator {} not found", req.actuator_id)))?;

        let r = client
            .set_position(Request::new(SetPositionRequest { angle: req.position }))
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .into_inner();

        Ok(Response::new(CommandResponse {
            success: r.success,
            message: r.message,
            refusal_code: r.refusal_code as i32,
        }))
    }

    // ── Calibration ────────────────────────────────────────────────────────

    async fn calibrate_actuator(
        &self,
        request: Request<CalibrateActuatorRequest>,
    ) -> Result<Response<CalibrateActuatorResponse>, Status> {
        let id = request.into_inner().actuator_id;
        info!(actuator_id = %id, "CalibrateActuator requested");
        // TODO: implement proper calibration protocol with the actuator
        Ok(Response::new(CalibrateActuatorResponse {
            success: false,
            message: "calibration not yet implemented".into(),
            zero_offset_rad: 0.0,
        }))
    }

    // ── Watchdog ───────────────────────────────────────────────────────────

    async fn heartbeat(
        &self,
        request: Request<HeartbeatRequest>,
    ) -> Result<Response<HeartbeatResponse>, Status> {
        self.heartbeat.touch();
        let _ts = request.into_inner().timestamp;
        Ok(Response::new(HeartbeatResponse {
            timestamp: now_ns(),
            watchdog_status: "ok".into(),
        }))
    }
}
