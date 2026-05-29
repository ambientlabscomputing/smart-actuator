//! gRPC servicer — implements SidecarService for the Brain.

use crate::aggregator::JointStateAggregator;
use crate::client_pool::ActuatorClientPool;
use crate::estop::EStopBroadcaster;
use crate::watchdog::HeartbeatHandle;
use actuator_proto::actuator::TrajectorySegmentRequest;
use actuator_proto::wire::async_wire::WireClient;
use futures::future::join_all;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
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
    CommandResponse, DeregisterPeerRequest, EStopRequest, GetJointStatesRequest,
    HeartbeatRequest, HeartbeatResponse, JointState, JointStateBatch, ListActuatorsRequest,
    ListActuatorsResponse, RegisterPeerRequest, SendCommandRequest, SendTrajectoryRequest,
    SetActuatorSoftLimitsRequest, StreamJointStatesRequest,
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
        // Clone clients out of the pool so the lock is not held while waiting
        // on network RPCs; then poll all actuators in parallel with a per-
        // actuator timeout so one dead peer cannot stall the others.
        let clients: Vec<(String, WireClient)> = {
            let pool = self.pool.lock().await;
            pool.iter().map(|(id, c)| (id.clone(), c)).collect()
        };

        let tasks = clients.into_iter().map(|(id, client)| async move {
            match tokio::time::timeout(
                Duration::from_millis(150),
                client.read_position(),
            )
            .await
            {
                Ok(Ok(resp)) => JointState {
                    actuator_id: id.clone(),
                    joint_name: id,
                    angle_rad: resp.angle,
                    velocity_rad_s: 0.0,
                    current_a: 0.0,
                    temperature_c: 0.0,
                    fault: String::new(),
                },
                Ok(Err(e)) => {
                    warn!(actuator_id = %id, error = %e, "get_joint_states: read failed");
                    JointState {
                        actuator_id: id.clone(),
                        joint_name: id,
                        angle_rad: 0.0,
                        velocity_rad_s: 0.0,
                        current_a: 0.0,
                        temperature_c: 0.0,
                        fault: e.to_string(),
                    }
                }
                Err(_) => {
                    warn!(actuator_id = %id, "get_joint_states: timeout");
                    JointState {
                        actuator_id: id.clone(),
                        joint_name: id,
                        angle_rad: 0.0,
                        velocity_rad_s: 0.0,
                        current_a: 0.0,
                        temperature_c: 0.0,
                        fault: "timeout".into(),
                    }
                }
            }
        });

        let joints = join_all(tasks).await;
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
                        temperature_c: s.temperature_c,
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

        // Build (actuator_id, client_clone, traj_req) while holding the pool
        let work: Vec<(String, WireClient, TrajectorySegmentRequest)> = {
            let pool = self.pool.lock().await;
            let mut v = Vec::new();
            for seg in req.segments {
                let actuator_id = seg.actuator_id.clone();
                let client = pool
                    .get(&actuator_id)
                    .ok_or_else(|| Status::not_found(format!("actuator {actuator_id} not found")))?;
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
                let traj_req = TrajectorySegmentRequest {
                    start_time_s: seg.start_time_ns as f64 / 1e9,
                    points,
                };
                v.push((actuator_id, client, traj_req));
            }
            v
        };

        let tasks = work.into_iter().map(|(act_id, client, traj_req)| async move {
            match tokio::time::timeout(
                Duration::from_millis(500),
                client.execute_trajectory_segment(traj_req),
            )
            .await
            {
                Ok(Ok(r)) => {
                    if r.success { None } else { Some(format!("{act_id}: {}", r.message)) }
                }
                Ok(Err(e)) => Some(format!("{act_id}: {e}")),
                Err(_) => Some(format!("{act_id}: trajectory command timed out")),
            }
        });

        let errors: Vec<String> = join_all(tasks).await.into_iter().flatten().collect();

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
        let client = {
            let pool = self.pool.lock().await;
            pool.get(&id).ok_or_else(|| Status::not_found(format!("actuator {id} not found")))?
        };
        match tokio::time::timeout(Duration::from_millis(500), client.pause()).await {
            Ok(Ok(r)) => Ok(Response::new(CommandResponse { success: r.success, message: r.message, refusal_code: 0 })),
            Ok(Err(e)) => Err(Status::internal(e.to_string())),
            Err(_) => Err(Status::deadline_exceeded(format!("actuator {id} pause timed out"))),
        }
    }

    async fn resume(
        &self,
        request: Request<ActuatorRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let id = request.into_inner().actuator_id;
        let client = {
            let pool = self.pool.lock().await;
            pool.get(&id).ok_or_else(|| Status::not_found(format!("actuator {id} not found")))?
        };
        match tokio::time::timeout(Duration::from_millis(500), client.resume()).await {
            Ok(Ok(r)) => Ok(Response::new(CommandResponse { success: r.success, message: r.message, refusal_code: 0 })),
            Ok(Err(e)) => Err(Status::internal(e.to_string())),
            Err(_) => Err(Status::deadline_exceeded(format!("actuator {id} resume timed out"))),
        }
    }

    async fn abort(
        &self,
        request: Request<ActuatorRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let id = request.into_inner().actuator_id;
        let client = {
            let pool = self.pool.lock().await;
            pool.get(&id).ok_or_else(|| Status::not_found(format!("actuator {id} not found")))?
        };
        match tokio::time::timeout(Duration::from_millis(500), client.abort()).await {
            Ok(Ok(r)) => Ok(Response::new(CommandResponse { success: r.success, message: r.message, refusal_code: 0 })),
            Ok(Err(e)) => Err(Status::internal(e.to_string())),
            Err(_) => Err(Status::deadline_exceeded(format!("actuator {id} abort timed out"))),
        }
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
        let client = {
            let pool = self.pool.lock().await;
            pool.get(&req.actuator_id)
                .ok_or_else(|| Status::not_found(format!("actuator {} not found", req.actuator_id)))?
        };
        match tokio::time::timeout(
            Duration::from_millis(500),
            client.set_position(req.position),
        )
        .await
        {
            Ok(Ok(r)) => {
                Ok(Response::new(CommandResponse {
                    success: r.success,
                    message: r.message,
                    refusal_code: r.refusal_code,
                }))
            }
            Ok(Err(e)) => {
                warn!(actuator_id = %req.actuator_id, error = %e, "SendCommand: transport error");
                Ok(Response::new(CommandResponse {
                    success: false,
                    message: format!("actuator unreachable: {e}"),
                    refusal_code: 9,
                }))
            }
            Err(_) => {
                warn!(actuator_id = %req.actuator_id, "SendCommand: 500 ms timeout");
                Ok(Response::new(CommandResponse {
                    success: false,
                    message: "actuator command timed out".into(),
                    refusal_code: 9,
                }))
            }
        }
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

    // ── Dynamic peer registration ──────────────────────────────────────────

    async fn register_peer(
        &self,
        request: Request<RegisterPeerRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let req = request.into_inner();
        info!(
            id = %req.actuator_id,
            address = %req.address,
            joint = %req.joint_name,
            simulated = req.is_simulated,
            "RegisterPeer requested"
        );
        let ep = crate::types::ActuatorEndpoint {
            id: req.actuator_id.clone(),
            address: req.address.clone(),
            joint_name: req.joint_name.clone(),
            is_simulated: req.is_simulated,
        };
        let mut pool = self.pool.lock().await;
        match pool.add_peer(ep).await {
            Ok(()) => Ok(Response::new(CommandResponse {
                success: true,
                message: format!("peer {} registered", req.actuator_id),
                refusal_code: 0,
            })),
            Err(e) => {
                warn!(id = %req.actuator_id, error = %e, "RegisterPeer: connection failed");
                Ok(Response::new(CommandResponse {
                    success: false,
                    message: format!("could not connect to {}: {e}", req.address),
                    refusal_code: 0,
                }))
            }
        }
    }

    async fn deregister_peer(
        &self,
        request: Request<DeregisterPeerRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let id = request.into_inner().actuator_id;
        info!(id = %id, "DeregisterPeer requested");
        let mut pool = self.pool.lock().await;
        let found = pool.remove_peer(&id);
        Ok(Response::new(CommandResponse {
            success: found,
            message: if found {
                format!("peer {id} deregistered")
            } else {
                format!("peer {id} not found")
            },
            refusal_code: 0,
        }))
    }

    // ── Safety configuration ───────────────────────────────────────────────

    async fn set_actuator_soft_limits(
        &self,
        request: Request<SetActuatorSoftLimitsRequest>,
    ) -> Result<Response<CommandResponse>, Status> {
        let req = request.into_inner();
        let client = {
            let pool = self.pool.lock().await;
            pool.get(&req.actuator_id)
                .ok_or_else(|| Status::not_found(format!("actuator {} not found", req.actuator_id)))?
        };
        match tokio::time::timeout(
            Duration::from_millis(500),
            client.set_soft_limits(req.min_rad, req.max_rad),
        )
        .await
        {
            Ok(Ok(r)) => {
                info!(
                    actuator_id = %req.actuator_id,
                    min_rad = req.min_rad,
                    max_rad = req.max_rad,
                    success = r.success,
                    "SetActuatorSoftLimits"
                );
                Ok(Response::new(CommandResponse {
                    success: r.success,
                    message: r.message,
                    refusal_code: r.refusal_code,
                }))
            }
            Ok(Err(e)) => {
                warn!(actuator_id = %req.actuator_id, error = %e, "SetSoftLimits: transport error");
                Ok(Response::new(CommandResponse {
                    success: false,
                    message: format!("actuator unreachable: {e}"),
                    refusal_code: 9,
                }))
            }
            Err(_) => {
                warn!(actuator_id = %req.actuator_id, "SetSoftLimits: timeout");
                Ok(Response::new(CommandResponse {
                    success: false,
                    message: "soft limits command timed out".into(),
                    refusal_code: 9,
                }))
            }
        }
    }
}
