//! Wire-protocol `ActuatorService` server for the ESP32 firmware.
//!
//! Two entry points:
//!
//! * [`serve_uart`] — primary USB-CDC / UART transport.  Reads requests
//!   synchronously from a UART driver, dispatches them to the service, and
//!   writes responses back.  No WiFi required.
//!
//! * [`serve_tcp`] — legacy TCP entry point kept for bring-up / fallback.
//!
//! # Design
//!
//! - **No `tokio::spawn`** — avoids `Box<dyn Future>` vtable dispatch that
//!   crashes the Xtensa window-save handler.
//! - **Tokio `current_thread` runtime** is kept because `AppService` uses
//!   `tokio::sync::Mutex`.
//! - **Blocking UART reads** from within `rt.block_on(serve_uart(…))` are
//!   safe: there are no other async tasks on the runtime.

use std::io::Write as _;
use std::sync::Arc;

use actuator_core::{types as domain, Service};
use actuator_proto::actuator::{
    ClockResponse, CommandResponse, CurrentResponse, PositionResponse, ReadRequest,
    SetControlModeRequest, SetCurrentLimitRequest, SetPositionRequest, SetSoftLimitsRequest,
    SetTemperatureLimitRequest, SetTorqueRequest, SetVelocityRequest, TemperatureResponse,
    TrackingErrorResponse, TrajectorySegmentRequest, VelocityResponse,
};
use actuator_proto::wire::{
    async_wire::{read_request, write_error},
    read_request_sync, write_error_sync,
    MethodId, WireStatus, MAGIC,
};
use esp_idf_svc::hal::uart::UartDriver;
use prost::Message;
use tokio::io::AsyncWriteExt as _;
use tokio::net::{TcpListener, TcpStream};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Shared request dispatcher ─────────────────────────────────────────────────
//
// Returns the prost-encoded response body, or (WireStatus, message) on error.
// Both UART and TCP servers call this function.

async fn dispatch_request(
    method_byte: u8,
    payload: Vec<u8>,
    service: &Arc<dyn Service>,
) -> Result<Vec<u8>, (WireStatus, String)> {
    macro_rules! decode {
        ($ty:ty) => {
            match <$ty>::decode(payload.as_slice()) {
                Ok(r) => r,
                Err(e) => return Err((WireStatus::DecodeError, e.to_string())),
            }
        };
    }

    match MethodId::try_from_u8(method_byte) {
        None => Err((WireStatus::UnknownMethod, format!("unknown method 0x{method_byte:02x}"))),

        Some(MethodId::SetPosition) => {
            let r: SetPositionRequest = decode!(SetPositionRequest);
            Ok(to_proto_cmd(service.set_position(r.angle).await).encode_to_vec())
        }
        Some(MethodId::SetVelocity) => {
            let r: SetVelocityRequest = decode!(SetVelocityRequest);
            Ok(to_proto_cmd(service.set_velocity(r.velocity).await).encode_to_vec())
        }
        Some(MethodId::SetTorque) => {
            let r: SetTorqueRequest = decode!(SetTorqueRequest);
            Ok(to_proto_cmd(service.set_torque(r.torque).await).encode_to_vec())
        }
        Some(MethodId::ReadPosition) => {
            let _: ReadRequest = decode!(ReadRequest);
            let r = service.read_position().await;
            Ok(PositionResponse { angle: r.angle }.encode_to_vec())
        }
        Some(MethodId::ReadVelocity) => {
            let _: ReadRequest = decode!(ReadRequest);
            let r = service.read_velocity().await;
            Ok(VelocityResponse { velocity: r.velocity }.encode_to_vec())
        }
        Some(MethodId::ReadCurrent) => {
            let _: ReadRequest = decode!(ReadRequest);
            let r = service.read_current().await;
            Ok(CurrentResponse { current: r.current }.encode_to_vec())
        }
        Some(MethodId::ReadTemperature) => {
            let _: ReadRequest = decode!(ReadRequest);
            let r = service.read_temperature().await;
            Ok(TemperatureResponse { temperature: r.temperature }.encode_to_vec())
        }
        Some(MethodId::SetSoftLimits) => {
            let r: SetSoftLimitsRequest = decode!(SetSoftLimitsRequest);
            Ok(to_proto_cmd(service.set_soft_limits(r.min, r.max).await).encode_to_vec())
        }
        Some(MethodId::SetCurrentLimit) => {
            let r: SetCurrentLimitRequest = decode!(SetCurrentLimitRequest);
            Ok(to_proto_cmd(service.set_current_limit(r.max_current).await).encode_to_vec())
        }
        Some(MethodId::SetTemperatureLimit) => {
            let r: SetTemperatureLimitRequest = decode!(SetTemperatureLimitRequest);
            Ok(to_proto_cmd(service.set_temperature_limit(r.max_temperature).await).encode_to_vec())
        }
        Some(MethodId::SetControlMode) => {
            let r: SetControlModeRequest = decode!(SetControlModeRequest);
            Ok(to_proto_cmd(service.set_control_mode(to_domain_mode(r.mode)).await).encode_to_vec())
        }
        Some(MethodId::ClearFault) => {
            let _: ReadRequest = decode!(ReadRequest);
            Ok(to_proto_cmd(service.clear_fault().await).encode_to_vec())
        }
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
            Ok(to_proto_cmd(service.execute_trajectory_segment(segment).await).encode_to_vec())
        }
        Some(MethodId::Pause) => {
            let _: ReadRequest = decode!(ReadRequest);
            Ok(to_proto_cmd(service.pause().await).encode_to_vec())
        }
        Some(MethodId::Resume) => {
            let _: ReadRequest = decode!(ReadRequest);
            Ok(to_proto_cmd(service.resume().await).encode_to_vec())
        }
        Some(MethodId::Abort) => {
            let _: ReadRequest = decode!(ReadRequest);
            Ok(to_proto_cmd(service.abort().await).encode_to_vec())
        }
        Some(MethodId::ReportTrackingError) => {
            let _: ReadRequest = decode!(ReadRequest);
            let r = service.report_tracking_error().await;
            Ok(TrackingErrorResponse {
                instantaneous: r.instantaneous,
                max_since_start: r.max_since_start,
                rms: r.rms,
            }
            .encode_to_vec())
        }
        Some(MethodId::GetClock) => {
            let _: ReadRequest = decode!(ReadRequest);
            Ok(ClockResponse { sim_time_s: service.get_clock().await }.encode_to_vec())
        }
    }
}

// ── Wire response frame builder ───────────────────────────────────────────────
//
// Builds [magic(2)][frame_len(4)][status(1)][body] into a Vec<u8>.

fn encode_response_frame(body: &[u8]) -> Vec<u8> {
    let frame_len = (1 + body.len()) as u32;
    let mut buf = Vec::with_capacity(7 + body.len());
    buf.extend_from_slice(&MAGIC.to_be_bytes());
    buf.extend_from_slice(&frame_len.to_be_bytes());
    buf.push(WireStatus::Ok as u8);
    buf.extend_from_slice(body);
    buf
}

// ── UART / USB-CDC server ─────────────────────────────────────────────────────

/// Adapter that bridges `UartDriver` (embedded-hal-style) to `std::io::{Read, Write}`.
struct UartIO<'d>(UartDriver<'d>);

impl<'d> std::io::Read for UartIO<'d> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.0
            .read(buf, esp_idf_svc::hal::delay::BLOCK)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    }
}

impl<'d> std::io::Write for UartIO<'d> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0
            .write(buf)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(()) // TX FIFO drains asynchronously; no explicit flush needed.
    }
}

/// Serve the wire protocol over UART / USB-CDC (primary production entry point).
///
/// On framing errors the magic-byte scanner in `read_request_sync` automatically
/// resyncs, so stale bytes from reset / power-on are harmless.
pub async fn serve_uart(uart: UartDriver<'static>, service: Arc<dyn Service>) -> anyhow::Result<()> {
    let mut io = UartIO(uart);
    log::info!("ActuatorService (wire/UART) started");

    loop {
        let (method_byte, payload) = match read_request_sync(&mut io) {
            Ok(r) => r,
            Err(e) => {
                log::warn!("UART read error: {e} — resyncing");
                continue; // magic-byte scanner resyncs on the next frame
            }
        };

        match dispatch_request(method_byte, payload, &service).await {
            Ok(body) => {
                let frame = encode_response_frame(&body);
                if let Err(e) = io.write_all(&frame) {
                    log::warn!("UART write error: {e}");
                }
            }
            Err((status, msg)) => {
                if let Err(e) = write_error_sync(&mut io, status, &msg) {
                    log::warn!("UART write_error: {e}");
                }
            }
        }
    }
}

// ── TCP server (legacy / bring-up) ───────────────────────────────────────────

async fn handle_connection(mut stream: TcpStream, service: Arc<dyn Service>) {
    log::debug!("ActuatorService (TCP): new connection");

    loop {
        let (method_byte, payload) = match read_request(&mut stream).await {
            Ok(r) => r,
            Err(e) => {
                let s = e.to_string();
                if !s.contains("eof") && !s.contains("reset") && !s.contains("broken pipe") {
                    log::warn!("ActuatorService (TCP): read_request: {s}");
                }
                break;
            }
        };

        match dispatch_request(method_byte, payload, &service).await {
            Ok(body) => {
                let frame = encode_response_frame(&body);
                if let Err(e) = stream.write_all(&frame).await {
                    log::warn!("ActuatorService (TCP): write failed: {e}");
                    break;
                }
            }
            Err((status, msg)) => {
                if let Err(e) = write_error(&mut stream, status, &msg).await {
                    log::warn!("ActuatorService (TCP): write_error: {e}");
                    break;
                }
            }
        }
    }

    log::debug!("ActuatorService (TCP): connection closed");
}

// ── Server entry point ────────────────────────────────────────────────────────

/// Listen on `0.0.0.0:port` and handle incoming sidecar connections (TCP).
///
/// Connections are handled **serially** (no `tokio::spawn`) to avoid
/// type-erased future vtable dispatch on Xtensa.
pub async fn serve_tcp(port: u16, service: Arc<dyn Service>) -> anyhow::Result<()> {
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr).await?;
    log::info!("ActuatorService (wire/TCP) listening on {addr}");

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                if let Err(e) = stream.set_nodelay(true) {
                    log::warn!("set_nodelay: {e}");
                }
                handle_connection(stream, Arc::clone(&service)).await;
            }
            Err(e) => {
                log::warn!("ActuatorService (TCP): accept: {e}");
            }
        }
    }
}
