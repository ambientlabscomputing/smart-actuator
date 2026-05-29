//! Length-prefixed framing protocol for actuator southbound communication.
//!
//! Replaces tonic/hyper/h2 on the southbound path so the ESP32 firmware
//! (Xtensa) is not exposed to the complex async task scheduling that causes
//! `RawTask::poll` vtable crashes on that architecture.
//!
//! # Wire format
//!
//! **Request frame** (client → server):
//! ```text
//! ┌──────────────────┬────────────┬─────────────────────────────────────┐
//! │  payload_len     │ method_id  │  prost-encoded request payload      │
//! │  u32 big-endian  │    u8      │  (payload_len - 1) bytes            │
//! └──────────────────┴────────────┴─────────────────────────────────────┘
//! ```
//!
//! **Response frame** (server → client):
//! ```text
//! ┌──────────────────┬────────┬──────────────────────────────────────────┐
//! │  payload_len     │ status │  prost-encoded response  OR             │
//! │  u32 big-endian  │   u8   │  UTF-8 error string (status != OK)      │
//! │                  │        │  (payload_len - 1) bytes                 │
//! └──────────────────┴────────┴──────────────────────────────────────────┘
//! ```
//!
//! `payload_len` covers the status/method byte plus the body bytes.
//! Maximum payload (after the 4-byte length prefix): 64 KiB.
//! No pipelining — at most one in-flight request per TCP connection.

use prost::Message;
use std::io::{self, Read, Write};

/// Maximum payload size (status/method byte + body).
const MAX_PAYLOAD: usize = 64 * 1024;

// ── Sync word ─────────────────────────────────────────────────────────────────
// Every frame (request and response) is preceded by these two bytes.
// On a byte-stream transport (serial / USB-CDC) the reader scans for this
// word to resync after framing errors or stale bytes left in the UART buffer.
// On TCP the sync word is redundant but harmless, and lets us share a single
// codec between both transports.

/// The frame sync word (`0xA5C3`, big-endian) written before every frame.
pub const MAGIC: u16 = 0xA5C3;
const MAGIC_BYTES: [u8; 2] = [0xA5, 0xC3];

// ── Method IDs ────────────────────────────────────────────────────────────────

/// Stable u8 identifiers for every `ActuatorService` RPC.
///
/// These values are part of the wire protocol. Do **not** change assigned
/// numbers without bumping the wire version and coordinating both sides.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum MethodId {
    // Level 1: commands
    SetPosition              = 0x01,
    SetVelocity              = 0x02,
    SetTorque                = 0x03,
    // Level 1: telemetry
    ReadPosition             = 0x10,
    ReadVelocity             = 0x11,
    ReadCurrent              = 0x12,
    ReadTemperature          = 0x13,
    // Level 2: safety
    SetSoftLimits            = 0x20,
    SetCurrentLimit          = 0x21,
    SetTemperatureLimit      = 0x22,
    SetControlMode           = 0x23,
    ClearFault               = 0x24,
    // Level 3: trajectory
    ExecuteTrajectorySegment = 0x30,
    Pause                    = 0x31,
    Resume                   = 0x32,
    Abort                    = 0x33,
    ReportTrackingError      = 0x40,
    GetClock                 = 0x41,
}

impl MethodId {
    /// Parse a raw byte, returning `None` for unrecognised values.
    pub fn try_from_u8(v: u8) -> Option<Self> {
        match v {
            0x01 => Some(Self::SetPosition),
            0x02 => Some(Self::SetVelocity),
            0x03 => Some(Self::SetTorque),
            0x10 => Some(Self::ReadPosition),
            0x11 => Some(Self::ReadVelocity),
            0x12 => Some(Self::ReadCurrent),
            0x13 => Some(Self::ReadTemperature),
            0x20 => Some(Self::SetSoftLimits),
            0x21 => Some(Self::SetCurrentLimit),
            0x22 => Some(Self::SetTemperatureLimit),
            0x23 => Some(Self::SetControlMode),
            0x24 => Some(Self::ClearFault),
            0x30 => Some(Self::ExecuteTrajectorySegment),
            0x31 => Some(Self::Pause),
            0x32 => Some(Self::Resume),
            0x33 => Some(Self::Abort),
            0x40 => Some(Self::ReportTrackingError),
            0x41 => Some(Self::GetClock),
            _    => None,
        }
    }
}

// ── Response status ───────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum WireStatus {
    Ok            = 0,
    UnknownMethod = 1,
    DecodeError   = 2,
    Internal      = 3,
}

impl WireStatus {
    fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Ok,
            1 => Self::UnknownMethod,
            2 => Self::DecodeError,
            _ => Self::Internal,
        }
    }
}

// ── Error type ────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum WireError {
    Io(io::Error),
    FrameTooLarge(usize),
    UnknownMethod(u8),
    DecodeError(prost::DecodeError),
    RemoteError { status: WireStatus, message: String },
}

impl core::fmt::Display for WireError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "wire I/O: {e}"),
            Self::FrameTooLarge(n) => write!(f, "wire frame too large ({n} bytes)"),
            Self::UnknownMethod(id) => write!(f, "unknown method id 0x{id:02x}"),
            Self::DecodeError(e) => write!(f, "prost decode: {e}"),
            Self::RemoteError { status, message } => {
                write!(f, "remote error ({status:?}): {message}")
            }
        }
    }
}

impl From<io::Error> for WireError {
    fn from(e: io::Error) -> Self { Self::Io(e) }
}

impl From<prost::DecodeError> for WireError {
    fn from(e: prost::DecodeError) -> Self { Self::DecodeError(e) }
}

impl std::error::Error for WireError {}

pub type WireResult<T> = Result<T, WireError>;

// ── Sync frame helpers (std::io) ──────────────────────────────────────────────
// Used by the firmware's blocking connection handler.

fn read_exact_alloc<R: Read>(r: &mut R, n: usize) -> io::Result<Vec<u8>> {
    let mut buf = vec![0u8; n];
    r.read_exact(&mut buf)?;
    Ok(buf)
}

/// Scan forward in `r` one byte at a time until the two-byte magic sequence
/// `[0xA5, 0xC3]` is consumed.  Returns `Ok(())` once the magic is found.
///
/// This is the serial-port resync mechanism: any garbage bytes (e.g. leftover
/// ESP-IDF log output, UART power-on noise) are skipped before reading the
/// actual frame header.
fn skip_to_magic_sync<R: Read>(r: &mut R) -> io::Result<()> {
    let mut prev = 0u8;
    let mut b = [0u8; 1];
    loop {
        r.read_exact(&mut b)?;
        if prev == MAGIC_BYTES[0] && b[0] == MAGIC_BYTES[1] {
            return Ok(());
        }
        prev = b[0];
    }
}

/// Read one request frame from a blocking reader.
/// Returns `(method_byte, prost_payload_bytes)`.
pub fn read_request_sync<R: Read>(r: &mut R) -> WireResult<(u8, Vec<u8>)> {
    skip_to_magic_sync(r)?;
    let mut len_buf = [0u8; 4];
    r.read_exact(&mut len_buf)?;
    let payload_len = u32::from_be_bytes(len_buf) as usize;
    if payload_len == 0 || payload_len > MAX_PAYLOAD + 1 {
        return Err(WireError::FrameTooLarge(payload_len));
    }
    let buf = read_exact_alloc(r, payload_len)?;
    Ok((buf[0], buf[1..].to_vec()))
}

/// Write a request frame with a prost-encoded message.
pub fn write_request_sync<W: Write, M: Message>(
    w: &mut W,
    method: MethodId,
    msg: &M,
) -> WireResult<()> {
    let payload = msg.encode_to_vec();
    let frame_len = 1 + payload.len();
    if frame_len > MAX_PAYLOAD + 1 {
        return Err(WireError::FrameTooLarge(frame_len));
    }
    w.write_all(&MAGIC_BYTES)?;
    w.write_all(&(frame_len as u32).to_be_bytes())?;
    w.write_all(&[method as u8])?;
    w.write_all(&payload)?;
    Ok(())
}

/// Write a success response frame with a prost-encoded message.
pub fn write_response_sync<W: Write, M: Message>(w: &mut W, msg: &M) -> WireResult<()> {
    let payload = msg.encode_to_vec();
    let frame_len = 1 + payload.len();
    if frame_len > MAX_PAYLOAD + 1 {
        return Err(WireError::FrameTooLarge(frame_len));
    }
    w.write_all(&MAGIC_BYTES)?;
    w.write_all(&(frame_len as u32).to_be_bytes())?;
    w.write_all(&[WireStatus::Ok as u8])?;
    w.write_all(&payload)?;
    Ok(())
}

/// Write an error response frame (status byte + UTF-8 description).
pub fn write_error_sync<W: Write>(w: &mut W, status: WireStatus, msg: &str) -> WireResult<()> {
    let bytes = msg.as_bytes();
    let frame_len = 1 + bytes.len();
    w.write_all(&MAGIC_BYTES)?;
    w.write_all(&(frame_len as u32).to_be_bytes())?;
    w.write_all(&[status as u8])?;
    w.write_all(bytes)?;
    Ok(())
}

/// Read a response frame. Returns `WireError::RemoteError` on non-OK status.
pub fn read_response_sync<R: Read, M: Message + Default>(r: &mut R) -> WireResult<M> {
    skip_to_magic_sync(r)?;
    let mut len_buf = [0u8; 4];
    r.read_exact(&mut len_buf)?;
    let payload_len = u32::from_be_bytes(len_buf) as usize;
    if payload_len == 0 || payload_len > MAX_PAYLOAD + 1 {
        return Err(WireError::FrameTooLarge(payload_len));
    }
    let buf = read_exact_alloc(r, payload_len)?;
    let status = WireStatus::from_u8(buf[0]);
    let body = &buf[1..];
    if status == WireStatus::Ok {
        Ok(M::decode(body)?)
    } else {
        Err(WireError::RemoteError {
            status,
            message: String::from_utf8_lossy(body).into_owned(),
        })
    }
}

// ── Async frame helpers + WireClient ──────────────────────────────────────────
// Compiled only when the `tokio` feature is enabled (Sidecar, Sim, Firmware).

#[cfg(feature = "tokio")]
pub mod async_wire {
    use super::{MethodId, WireError, WireResult, WireStatus, MAGIC_BYTES, MAX_PAYLOAD};
    use crate::actuator::{
        ClockResponse, CommandResponse, CurrentResponse, PositionResponse, ReadRequest,
        SetControlModeRequest, SetCurrentLimitRequest, SetPositionRequest, SetSoftLimitsRequest,
        SetTemperatureLimitRequest, SetTorqueRequest, SetVelocityRequest, TemperatureResponse,
        TrackingErrorResponse, TrajectorySegmentRequest, VelocityResponse,
    };
    use prost::Message;
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;
    use tokio::sync::Mutex;

    #[cfg(feature = "serial")]
    use tokio_serial::SerialStream;

    // ── Frame-level async I/O ─────────────────────────────────────────────────

    /// Scan forward in `r` until the two-byte magic `[0xA5, 0xC3]` is consumed.
    pub async fn skip_to_magic<R: AsyncReadExt + Unpin>(r: &mut R) -> WireResult<()> {
        let mut prev = 0u8;
        loop {
            let b = r.read_u8().await?;
            if prev == MAGIC_BYTES[0] && b == MAGIC_BYTES[1] {
                return Ok(());
            }
            prev = b;
        }
    }

    /// Read a request frame from an async reader.
    /// Returns `(method_byte, prost_payload_bytes)`.
    pub async fn read_request<R: AsyncReadExt + Unpin>(
        r: &mut R,
    ) -> WireResult<(u8, Vec<u8>)> {
        skip_to_magic(r).await?;
        let payload_len = r.read_u32().await? as usize;
        if payload_len == 0 || payload_len > MAX_PAYLOAD + 1 {
            return Err(WireError::FrameTooLarge(payload_len));
        }
        let mut buf = vec![0u8; payload_len];
        r.read_exact(&mut buf).await?;
        Ok((buf[0], buf[1..].to_vec()))
    }

    /// Write a success response frame.
    pub async fn write_response<W: AsyncWriteExt + Unpin, M: Message>(
        w: &mut W,
        msg: &M,
    ) -> WireResult<()> {
        let payload = msg.encode_to_vec();
        let frame_len = 1 + payload.len();
        if frame_len > MAX_PAYLOAD + 1 {
            return Err(WireError::FrameTooLarge(frame_len));
        }
        w.write_all(&MAGIC_BYTES).await?;
        w.write_u32(frame_len as u32).await?;
        w.write_u8(WireStatus::Ok as u8).await?;
        w.write_all(&payload).await?;
        Ok(())
    }

    /// Write an error response frame.
    pub async fn write_error<W: AsyncWriteExt + Unpin>(
        w: &mut W,
        status: WireStatus,
        msg: &str,
    ) -> WireResult<()> {
        let bytes = msg.as_bytes();
        let frame_len = 1 + bytes.len();
        w.write_all(&MAGIC_BYTES).await?;
        w.write_u32(frame_len as u32).await?;
        w.write_u8(status as u8).await?;
        w.write_all(bytes).await?;
        Ok(())
    }

    /// Write a request frame with a prost-encoded message.
    pub async fn write_request<W: AsyncWriteExt + Unpin, M: Message>(
        w: &mut W,
        method: MethodId,
        msg: &M,
    ) -> WireResult<()> {
        let payload = msg.encode_to_vec();
        let frame_len = 1 + payload.len();
        if frame_len > MAX_PAYLOAD + 1 {
            return Err(WireError::FrameTooLarge(frame_len));
        }
        w.write_all(&MAGIC_BYTES).await?;
        w.write_u32(frame_len as u32).await?;
        w.write_u8(method as u8).await?;
        w.write_all(&payload).await?;
        Ok(())
    }

    /// Read a response frame. Returns `WireError::RemoteError` on non-OK status.
    pub async fn read_response<R: AsyncReadExt + Unpin, M: Message + Default>(
        r: &mut R,
    ) -> WireResult<M> {
        skip_to_magic(r).await?;
        let payload_len = r.read_u32().await? as usize;
        if payload_len == 0 || payload_len > MAX_PAYLOAD + 1 {
            return Err(WireError::FrameTooLarge(payload_len));
        }
        let mut buf = vec![0u8; payload_len];
        r.read_exact(&mut buf).await?;
        let status = WireStatus::from_u8(buf[0]);
        let body = &buf[1..];
        if status == WireStatus::Ok {
            Ok(M::decode(body)?)
        } else {
            Err(WireError::RemoteError {
                status,
                message: String::from_utf8_lossy(body).into_owned(),
            })
        }
    }

    // ── Transport abstraction ─────────────────────────────────────────────────

    /// An open connection to one actuator — either TCP or a native serial port.
    enum Transport {
        Tcp(TcpStream),
        #[cfg(feature = "serial")]
        Serial(SerialStream),
    }

    /// Send one request frame and read back one response frame.
    ///
    /// Generic over the stream type so the same code works for TCP and serial.
    async fn do_exchange<S>(
        stream: &mut S,
        method: MethodId,
        req_bytes: &[u8],
    ) -> WireResult<Vec<u8>>
    where
        S: AsyncReadExt + AsyncWriteExt + Unpin,
    {
        // Request: [magic u16][frame_len u32][method u8][payload]
        let frame_len = (1 + req_bytes.len()) as u32;
        stream.write_all(&MAGIC_BYTES).await?;
        stream.write_u32(frame_len).await?;
        stream.write_u8(method as u8).await?;
        stream.write_all(req_bytes).await?;

        // Response: scan for magic, then [payload_len u32][status u8][body]
        skip_to_magic(stream).await?;
        let payload_len = stream.read_u32().await? as usize;
        if payload_len == 0 || payload_len > MAX_PAYLOAD + 1 {
            return Err(WireError::FrameTooLarge(payload_len));
        }
        let mut buf = vec![0u8; payload_len];
        stream.read_exact(&mut buf).await?;
        let status = WireStatus::from_u8(buf[0]);
        let body = buf[1..].to_vec();
        if status == WireStatus::Ok {
            Ok(body)
        } else {
            Err(WireError::RemoteError {
                status,
                message: String::from_utf8_lossy(&body).into_owned(),
            })
        }
    }

    // ── WireClient ────────────────────────────────────────────────────────────

    /// Async actuator client over the wire framing protocol.
    ///
    /// Wraps a transport connection (TCP socket or serial port) behind a
    /// `Mutex` so multiple concurrent callers are serialised (no pipelining).
    /// Cloning produces a second handle sharing the same connection via `Arc`.
    ///
    /// On any I/O error the connection is dropped; the next call will
    /// lazily reconnect.
    ///
    /// # Address formats
    ///
    /// | Scheme | Example | Transport |
    /// |--------|---------|-----------|
    /// | (none) or `http://` | `192.168.4.1:50051` | TCP |
    /// | `serial://` | `serial:///dev/cu.usbserial-0001?baud=921600` | serial port |
    #[derive(Clone)]
    pub struct WireClient {
        inner: Arc<Mutex<Option<Transport>>>,
        /// Original address string, reused for reconnects.
        addr: String,
    }

    impl WireClient {
        /// Connect to an actuator immediately.
        ///
        /// Parses the address scheme and opens either a TCP socket or a serial
        /// port. TCP connects with a 250 ms timeout. Serial port opens are
        /// synchronous (just opens the device file).
        pub async fn connect(addr: &str) -> WireResult<Self> {
            let transport = Self::new_transport(addr).await?;
            Ok(Self {
                inner: Arc::new(Mutex::new(Some(transport))),
                addr: addr.to_owned(),
            })
        }

        /// Create a client without opening a connection immediately.
        ///
        /// The connection is attempted on the first RPC call (lazy reconnect).
        /// Never fails — peer registration succeeds even if the actuator is
        /// still booting.
        pub fn lazy(addr: &str) -> Self {
            Self {
                inner: Arc::new(Mutex::new(None)),
                addr: addr.to_owned(),
            }
        }

        /// Open a transport based on the address scheme.
        async fn new_transport(addr: &str) -> WireResult<Transport> {
            #[cfg(feature = "serial")]
            if let Some(serial_part) = addr.strip_prefix("serial://") {
                let (path, baud) = Self::parse_serial_url(serial_part)?;
                let stream = tokio_serial::SerialStream::open(
                    &tokio_serial::new(&path, baud),
                )
                .map_err(|e| {
                    WireError::Io(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("serial open {path}: {e}"),
                    ))
                })?;
                return Ok(Transport::Serial(stream));
            }

            // TCP (strip optional http:// scheme).
            let tcp_addr = addr.trim_start_matches("http://");
            let stream = tokio::time::timeout(
                Duration::from_millis(250),
                TcpStream::connect(tcp_addr),
            )
            .await
            .map_err(|_| {
                WireError::Io(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    format!("connect timeout to {tcp_addr}"),
                ))
            })??;
            stream.set_nodelay(true)?;
            Ok(Transport::Tcp(stream))
        }

        /// Parse `serial:///dev/cu.usbserial-XXXX?baud=921600`.
        ///
        /// The `serial://` prefix has already been stripped; `rest` is
        /// `/dev/cu.usbserial-XXXX?baud=921600`.  Default baud: 921 600.
        #[cfg(feature = "serial")]
        fn parse_serial_url(rest: &str) -> WireResult<(String, u32)> {
            let (path, query) = rest.split_once('?').unwrap_or((rest, ""));
            let baud = query
                .split('&')
                .find_map(|kv| {
                    let (k, v) = kv.split_once('=')?;
                    if k == "baud" { v.parse().ok() } else { None }
                })
                .unwrap_or(921_600u32);
            if path.is_empty() {
                return Err(WireError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "serial URL has no device path (expected serial:///dev/...)",
                )));
            }
            Ok((path.to_owned(), baud))
        }

        /// Send one request and return the raw response body bytes.
        ///
        /// Tries the existing connection first, reconnects on I/O error, then
        /// tries once more.  The connection attempt is bounded by the transport
        /// type (TCP: 250 ms timeout; serial: immediate file open).
        async fn call_raw(&self, method: MethodId, req_bytes: &[u8]) -> WireResult<Vec<u8>> {
            let mut guard = self.inner.lock().await;

            // Try existing connection.
            if let Some(transport) = guard.as_mut() {
                let result = match transport {
                    Transport::Tcp(s) => do_exchange(s, method, req_bytes).await,
                    #[cfg(feature = "serial")]
                    Transport::Serial(s) => do_exchange(s, method, req_bytes).await,
                };
                match result {
                    Ok(body) => return Ok(body),
                    Err(WireError::Io(_)) => {
                        // Connection broken — drop and reconnect below.
                        *guard = None;
                    }
                    Err(e) => return Err(e),
                }
            }

            // (Re)connect.
            let transport = Self::new_transport(&self.addr).await?;
            *guard = Some(transport);
            match guard.as_mut().unwrap() {
                Transport::Tcp(s) => do_exchange(s, method, req_bytes).await,
                #[cfg(feature = "serial")]
                Transport::Serial(s) => do_exchange(s, method, req_bytes).await,
            }
        }

        async fn call<Req: Message, Resp: Message + Default>(
            &self,
            method: MethodId,
            req: &Req,
        ) -> WireResult<Resp> {
            let body = self.call_raw(method, &req.encode_to_vec()).await?;
            Ok(Resp::decode(body.as_slice())?)
        }

        // ── Level 1: commands ─────────────────────────────────────────────────

        pub async fn set_position(&self, angle: f64) -> WireResult<CommandResponse> {
            self.call(MethodId::SetPosition, &SetPositionRequest { angle }).await
        }

        pub async fn set_velocity(&self, velocity: f64) -> WireResult<CommandResponse> {
            self.call(MethodId::SetVelocity, &SetVelocityRequest { velocity }).await
        }

        pub async fn set_torque(&self, torque: f64) -> WireResult<CommandResponse> {
            self.call(MethodId::SetTorque, &SetTorqueRequest { torque }).await
        }

        // ── Level 1: telemetry ────────────────────────────────────────────────

        pub async fn read_position(&self) -> WireResult<PositionResponse> {
            self.call(MethodId::ReadPosition, &ReadRequest {}).await
        }

        pub async fn read_velocity(&self) -> WireResult<VelocityResponse> {
            self.call(MethodId::ReadVelocity, &ReadRequest {}).await
        }

        pub async fn read_current(&self) -> WireResult<CurrentResponse> {
            self.call(MethodId::ReadCurrent, &ReadRequest {}).await
        }

        pub async fn read_temperature(&self) -> WireResult<TemperatureResponse> {
            self.call(MethodId::ReadTemperature, &ReadRequest {}).await
        }

        // ── Level 2: safety ───────────────────────────────────────────────────

        pub async fn set_soft_limits(&self, min: f64, max: f64) -> WireResult<CommandResponse> {
            self.call(MethodId::SetSoftLimits, &SetSoftLimitsRequest { min, max }).await
        }

        pub async fn set_current_limit(&self, max_current: f64) -> WireResult<CommandResponse> {
            self.call(MethodId::SetCurrentLimit, &SetCurrentLimitRequest { max_current }).await
        }

        pub async fn set_temperature_limit(
            &self,
            max_temperature: f64,
        ) -> WireResult<CommandResponse> {
            self.call(
                MethodId::SetTemperatureLimit,
                &SetTemperatureLimitRequest { max_temperature },
            )
            .await
        }

        /// `mode` is the i32 value of `ControlModeProto` (0=Position, 1=Velocity, …).
        pub async fn set_control_mode(&self, mode: i32) -> WireResult<CommandResponse> {
            self.call(MethodId::SetControlMode, &SetControlModeRequest { mode }).await
        }

        pub async fn clear_fault(&self) -> WireResult<CommandResponse> {
            self.call(MethodId::ClearFault, &ReadRequest {}).await
        }

        // ── Level 3: trajectory ───────────────────────────────────────────────

        pub async fn execute_trajectory_segment(
            &self,
            req: TrajectorySegmentRequest,
        ) -> WireResult<CommandResponse> {
            self.call(MethodId::ExecuteTrajectorySegment, &req).await
        }

        pub async fn pause(&self) -> WireResult<CommandResponse> {
            self.call(MethodId::Pause, &ReadRequest {}).await
        }

        pub async fn resume(&self) -> WireResult<CommandResponse> {
            self.call(MethodId::Resume, &ReadRequest {}).await
        }

        pub async fn abort(&self) -> WireResult<CommandResponse> {
            self.call(MethodId::Abort, &ReadRequest {}).await
        }

        pub async fn report_tracking_error(&self) -> WireResult<TrackingErrorResponse> {
            self.call(MethodId::ReportTrackingError, &ReadRequest {}).await
        }

        pub async fn get_clock(&self) -> WireResult<f64> {
            let resp: ClockResponse = self.call(MethodId::GetClock, &ReadRequest {}).await?;
            Ok(resp.sim_time_s)
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actuator::{CommandResponse, PositionResponse, SetPositionRequest};
    use std::io::Cursor;

    #[test]
    fn round_trip_request() {
        let req = SetPositionRequest { angle: 1.234 };
        let mut buf = Vec::new();
        write_request_sync(&mut buf, MethodId::SetPosition, &req).unwrap();

        let mut cursor = Cursor::new(&buf);
        let (method_byte, payload) = read_request_sync(&mut cursor).unwrap();
        assert_eq!(method_byte, MethodId::SetPosition as u8);
        let decoded = SetPositionRequest::decode(payload.as_slice()).unwrap();
        assert!((decoded.angle - 1.234).abs() < 1e-10);
    }

    #[test]
    fn round_trip_ok_response() {
        let resp = PositionResponse { angle: 2.718 };
        let mut buf = Vec::new();
        write_response_sync(&mut buf, &resp).unwrap();

        let mut cursor = Cursor::new(&buf);
        let decoded: PositionResponse = read_response_sync(&mut cursor).unwrap();
        assert!((decoded.angle - 2.718).abs() < 1e-10);
    }

    #[test]
    fn round_trip_error_response() {
        let mut buf = Vec::new();
        write_error_sync(&mut buf, WireStatus::UnknownMethod, "bad method").unwrap();

        let mut cursor = Cursor::new(&buf);
        let err: WireError =
            read_response_sync::<_, CommandResponse>(&mut cursor).unwrap_err();
        match err {
            WireError::RemoteError { status: WireStatus::UnknownMethod, message } => {
                assert_eq!(message, "bad method");
            }
            other => panic!("unexpected: {other}"),
        }
    }

    #[test]
    fn all_method_ids_round_trip() {
        let methods = [
            MethodId::SetPosition,
            MethodId::SetVelocity,
            MethodId::SetTorque,
            MethodId::ReadPosition,
            MethodId::ReadVelocity,
            MethodId::ReadCurrent,
            MethodId::ReadTemperature,
            MethodId::SetSoftLimits,
            MethodId::SetCurrentLimit,
            MethodId::SetTemperatureLimit,
            MethodId::SetControlMode,
            MethodId::ClearFault,
            MethodId::ExecuteTrajectorySegment,
            MethodId::Pause,
            MethodId::Resume,
            MethodId::Abort,
            MethodId::ReportTrackingError,
            MethodId::GetClock,
        ];
        for m in methods {
            assert_eq!(MethodId::try_from_u8(m as u8), Some(m));
        }
        assert!(MethodId::try_from_u8(0x00).is_none());
        assert!(MethodId::try_from_u8(0xFF).is_none());
    }
}
