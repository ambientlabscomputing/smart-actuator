//! Framed-TCP `ActuatorService` server for the simulator.
//!
//! Replaces the tonic gRPC server. The Sidecar connects via the wire framing
//! protocol defined in `actuator_proto::wire`.
//!
//! Each accepted connection gets its own tokio task and handles requests
//! sequentially (no pipelining). The service is shared across all connections
//! via `Arc<dyn Service>`.

use std::future::Future;
use std::net::SocketAddr;
use std::sync::Arc;

use actuator_core::{types as domain, Service};
use actuator_proto::actuator::{
    ClockResponse, CommandResponse, CurrentResponse, PositionResponse, ReadRequest,
    SetControlModeRequest, SetCurrentLimitRequest, SetPositionRequest, SetSoftLimitsRequest,
    SetTemperatureLimitRequest, SetTorqueRequest, SetVelocityRequest, TemperatureResponse,
    TrackingErrorResponse, TrajectorySegmentRequest, VelocityResponse,
};
use actuator_proto::wire::{
    async_wire::{read_request, write_error, write_response},
    MethodId, WireStatus,
};
use prost::Message;
use tokio::net::{TcpListener, TcpStream};
use tracing::{debug, info, warn};

use crate::config::GrpcConfig;

// ── Refusal-code mapping ──────────────────────────────────────────────────────
// Must stay in sync with actuator.proto's RefusalCode enum and with the
// Sidecar's expectation (0=none, 1-7=domain reasons).

fn to_proto_cmd(r: domain::CommandResponse) -> CommandResponse {
    CommandResponse {
        success: r.success,
        message: r.message,
        refusal_code: match r.refusal {
            None => 0,
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

fn to_domain_mode(mode: i32) -> domain::ControlMode {
    match mode {
        1 => domain::ControlMode::Velocity,
        2 => domain::ControlMode::Torque,
        3 => domain::ControlMode::Impedance,
        _ => domain::ControlMode::Position,
    }
}

// ── Per-connection handler ────────────────────────────────────────────────────

async fn handle_connection(mut stream: TcpStream, service: Arc<dyn Service>) {
    let peer = stream.peer_addr().map_or_else(|_| "unknown".into(), |a| a.to_string());
    debug!(peer = %peer, "ActuatorService: new connection");

    loop {
        let (method_byte, payload) = match read_request(&mut stream).await {
            Ok(r) => r,
            Err(e) => {
                // EOF is normal when the Sidecar closes; log other errors.
                let s = e.to_string();
                if !s.contains("eof") && !s.contains("reset") && !s.contains("broken pipe") {
                    warn!(peer = %peer, error = %s, "read_request failed");
                }
                break;
            }
        };

        macro_rules! decode {
            ($ty:ty) => {
                match <$ty>::decode(payload.as_slice()) {
                    Ok(r) => r,
                    Err(e) => {
                        let _ = write_error(&mut stream, WireStatus::DecodeError, &e.to_string())
                            .await;
                        continue;
                    }
                }
            };
        }

        macro_rules! respond {
            ($msg:expr) => {
                if let Err(e) = write_response(&mut stream, &$msg).await {
                    warn!(peer = %peer, error = %e, "write_response failed");
                    break;
                }
            };
        }

        match MethodId::try_from_u8(method_byte) {
            None => {
                let _ = write_error(
                    &mut stream,
                    WireStatus::UnknownMethod,
                    &format!("unknown method 0x{method_byte:02x}"),
                )
                .await;
            }

            // ── Level 1: commands ─────────────────────────────────────────────

            Some(MethodId::SetPosition) => {
                let r: SetPositionRequest = decode!(SetPositionRequest);
                respond!(to_proto_cmd(service.set_position(r.angle).await));
            }
            Some(MethodId::SetVelocity) => {
                let r: SetVelocityRequest = decode!(SetVelocityRequest);
                respond!(to_proto_cmd(service.set_velocity(r.velocity).await));
            }
            Some(MethodId::SetTorque) => {
                let r: SetTorqueRequest = decode!(SetTorqueRequest);
                respond!(to_proto_cmd(service.set_torque(r.torque).await));
            }

            // ── Level 1: telemetry ────────────────────────────────────────────

            Some(MethodId::ReadPosition) => {
                let r = service.read_position().await;
                respond!(PositionResponse { angle: r.angle });
            }
            Some(MethodId::ReadVelocity) => {
                let r = service.read_velocity().await;
                respond!(VelocityResponse { velocity: r.velocity });
            }
            Some(MethodId::ReadCurrent) => {
                let r = service.read_current().await;
                respond!(CurrentResponse { current: r.current });
            }
            Some(MethodId::ReadTemperature) => {
                let r = service.read_temperature().await;
                respond!(TemperatureResponse { temperature: r.temperature });
            }

            // ── Level 2: safety ───────────────────────────────────────────────

            Some(MethodId::SetSoftLimits) => {
                let r: SetSoftLimitsRequest = decode!(SetSoftLimitsRequest);
                respond!(to_proto_cmd(service.set_soft_limits(r.min, r.max).await));
            }
            Some(MethodId::SetCurrentLimit) => {
                let r: SetCurrentLimitRequest = decode!(SetCurrentLimitRequest);
                respond!(to_proto_cmd(service.set_current_limit(r.max_current).await));
            }
            Some(MethodId::SetTemperatureLimit) => {
                let r: SetTemperatureLimitRequest = decode!(SetTemperatureLimitRequest);
                respond!(to_proto_cmd(
                    service.set_temperature_limit(r.max_temperature).await
                ));
            }
            Some(MethodId::SetControlMode) => {
                let r: SetControlModeRequest = decode!(SetControlModeRequest);
                respond!(to_proto_cmd(
                    service.set_control_mode(to_domain_mode(r.mode)).await
                ));
            }
            Some(MethodId::ClearFault) => {
                let _: ReadRequest = decode!(ReadRequest);
                respond!(to_proto_cmd(service.clear_fault().await));
            }

            // ── Level 3: trajectory ───────────────────────────────────────────

            Some(MethodId::ExecuteTrajectorySegment) => {
                let r: TrajectorySegmentRequest = decode!(TrajectorySegmentRequest);
                let segment = domain::TrajectorySegment {
                    start_time_s: r.start_time_s,
                    points: r
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
                respond!(to_proto_cmd(service.execute_trajectory_segment(segment).await));
            }
            Some(MethodId::Pause) => {
                let _: ReadRequest = decode!(ReadRequest);
                respond!(to_proto_cmd(service.pause().await));
            }
            Some(MethodId::Resume) => {
                let _: ReadRequest = decode!(ReadRequest);
                respond!(to_proto_cmd(service.resume().await));
            }
            Some(MethodId::Abort) => {
                let _: ReadRequest = decode!(ReadRequest);
                respond!(to_proto_cmd(service.abort().await));
            }
            Some(MethodId::ReportTrackingError) => {
                let _: ReadRequest = decode!(ReadRequest);
                let r = service.report_tracking_error().await;
                respond!(TrackingErrorResponse {
                    instantaneous: r.instantaneous,
                    max_since_start: r.max_since_start,
                    rms: r.rms,
                });
            }
            Some(MethodId::GetClock) => {
                let _: ReadRequest = decode!(ReadRequest);
                respond!(ClockResponse { sim_time_s: service.get_clock().await });
            }
        }
    }

    debug!(peer = %peer, "ActuatorService: connection closed");
}

// ── Server entry point ────────────────────────────────────────────────────────

/// Serve the `ActuatorService` wire protocol on `cfg.host:cfg.port`.
///
/// Accepts connections until `shutdown` resolves (typically on SIGTERM/SIGINT).
pub async fn serve(
    cfg: &GrpcConfig,
    service: Arc<dyn Service>,
    shutdown: impl Future<Output = ()>,
) -> anyhow::Result<()> {
    let addr: SocketAddr = format!("{}:{}", cfg.host, cfg.port).parse()?;
    let listener = TcpListener::bind(addr).await?;
    info!(addr = %addr, "ActuatorService (wire) listening");

    tokio::pin!(shutdown);
    loop {
        tokio::select! {
            result = listener.accept() => {
                match result {
                    Ok((stream, _)) => {
                        stream.set_nodelay(true)?;
                        let svc = Arc::clone(&service);
                        tokio::spawn(handle_connection(stream, svc));
                    }
                    Err(e) => {
                        warn!(error = %e, "accept error");
                    }
                }
            }
            _ = &mut shutdown => {
                info!("ActuatorService: shutdown signal received");
                break;
            }
        }
    }

    Ok(())
}
