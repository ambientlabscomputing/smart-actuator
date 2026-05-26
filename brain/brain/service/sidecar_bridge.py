import asyncio
import time
from typing import TYPE_CHECKING

import grpc
import grpc.aio

from brain.models.actuator import Actuator
from brain.models.motion import ActuatorTrajectorySegment
from brain.models.state import JointState
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.interface.grpc.generated import sidecar_pb2_grpc as _SidecarStubType


class SidecarBridge:
    """
    Manages the gRPC connection to the Rust sidecar over a Unix socket.
    The sidecar owns the critical path: transport, discovery, watchdog,
    E-stop fan-out, and aggregated joint-state streaming.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._channel: grpc.aio.Channel | None = None
        self._stub: "_SidecarStubType.SidecarServiceStub | None" = None
        self._stream_task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._heartbeat_task: asyncio.Task | None = None  # type: ignore[type-arg]

    @property
    def _connected(self) -> bool:
        return self._channel is not None

    async def connect(self) -> None:
        # Lazy import breaks the circular dependency between brain.service and
        # brain.interface (which both import each other transitively).
        from brain.interface.grpc.generated import sidecar_pb2_grpc  # noqa: PLC0415

        addr = self._config.sidecar_socket
        logger.info("Connecting to sidecar at {}", addr)
        # NOTE: grpcio over a Unix-domain socket sets the HTTP/2 :authority
        # header to a URL-encoded form of the socket path (e.g.
        # "tmp%2Fsidecar.sock"), which tonic >= 0.12 rejects as a malformed
        # authority and answers with RST_STREAM(PROTOCOL_ERROR). Override the
        # default authority to a plain ASCII token so tonic accepts it.
        channel_options = [("grpc.default_authority", "localhost")]
        self._channel = grpc.aio.insecure_channel(addr, options=channel_options)
        self._stub = sidecar_pb2_grpc.SidecarServiceStub(self._channel)
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def _heartbeat_loop(self) -> None:
        """Send a Heartbeat RPC every second so the sidecar watchdog stays armed."""
        from brain.interface.grpc.generated import sidecar_pb2  # noqa: PLC0415

        assert self._stub is not None
        stub = self._stub
        while True:
            try:
                await stub.Heartbeat(
                    sidecar_pb2.HeartbeatRequest(timestamp=time.time_ns()),
                    timeout=2.0,
                )
            except grpc.aio.AioRpcError as e:
                logger.debug("Sidecar heartbeat error: {} — {}", e.code(), e.details())
            except asyncio.CancelledError:
                return
            except Exception:
                logger.exception("Unexpected error in sidecar heartbeat loop")
            try:
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                return

    async def disconnect(self) -> None:
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None

        if self._stream_task is not None:
            self._stream_task.cancel()
            try:
                await self._stream_task
            except asyncio.CancelledError:
                pass
            self._stream_task = None

        if self._channel is not None:
            await self._channel.close()
            self._channel = None
            self._stub = None

        logger.info("Sidecar bridge disconnected")

    async def list_actuators(self) -> list[Actuator]:
        """Return actuators discovered by the sidecar."""
        # TODO: call sidecar.ListActuators RPC
        return []

    async def send_trajectory_segments(self, segments: list[ActuatorTrajectorySegment]) -> None:
        """Hand per-actuator trajectory segments to the sidecar."""
        # TODO: call sidecar.SendTrajectory RPC
        logger.debug("Sending {} trajectory segments to sidecar", len(segments))

    async def subscribe_joint_states(self, callback: object) -> None:
        """
        Open a server-streaming RPC and call *callback(joints, machine_id)* for
        each aggregated JointStateBatch received from the sidecar.
        """
        if self._stub is None:
            raise RuntimeError("SidecarBridge: not connected — call connect() first")

        from brain.interface.grpc.generated import sidecar_pb2  # noqa: PLC0415

        stub = self._stub

        async def _stream_loop() -> None:
            delay = 1.0
            max_delay = 16.0
            while True:
                try:
                    request = sidecar_pb2.StreamJointStatesRequest()
                    async for batch in stub.StreamJointStates(request):
                        delay = 1.0  # reset backoff on first successful frame
                        joints = [
                            JointState(
                                joint_name=js.joint_name or js.actuator_id,
                                angle_rad=js.angle_rad,
                                velocity_rad_s=js.velocity_rad_s,
                                current_a=js.current_a,
                                fault=js.fault or None,
                            )
                            for js in batch.joints
                        ]
                        callback(joints, "j1")  # type: ignore[operator]
                    # Server closed the stream cleanly — retry immediately.
                    logger.info("Sidecar stream closed cleanly, reconnecting ...")
                except grpc.aio.AioRpcError as e:
                    logger.warning(
                        "Sidecar stream error: {} — {} — retrying in {:.0f}s",
                        e.code(),
                        e.details(),
                        delay,
                    )
                except asyncio.CancelledError:
                    return
                except Exception:
                    logger.exception("Unexpected error in sidecar stream loop")

                try:
                    await asyncio.sleep(delay)
                except asyncio.CancelledError:
                    return
                delay = min(delay * 2, max_delay)

        self._stream_task = asyncio.create_task(_stream_loop())
        logger.info("Sidecar joint-state stream subscribed")

    async def estop(self) -> None:
        """Fan-out E-stop to all actuators via the sidecar's critical path."""
        if self._stub is None:
            logger.warning("EStop called but sidecar not connected — skipping")
            return
        from brain.interface.grpc.generated import sidecar_pb2  # noqa: PLC0415
        from brain.utils.context import journey_id_var  # noqa: PLC0415

        logger.warning("E-stop sent to sidecar")
        metadata = [("x-journey-id", journey_id_var.get())]
        await self._stub.EStop(sidecar_pb2.EStopRequest(), metadata=metadata)

    async def send_command(self, actuator_id: str, *, position: float) -> dict[str, object]:
        """
        Send a direct position command to a single actuator via the sidecar.
        Returns {"success": bool, "message": str, "refusal_code": int}.
        """
        if self._stub is None:
            raise RuntimeError("SidecarBridge: not connected — call connect() first")
        from brain.interface.grpc.generated import sidecar_pb2  # noqa: PLC0415
        from brain.utils.context import journey_id_var  # noqa: PLC0415

        metadata = [("x-journey-id", journey_id_var.get())]
        req = sidecar_pb2.SendCommandRequest(actuator_id=actuator_id, position=position)
        resp = await self._stub.SendCommand(req, metadata=metadata)
        return {
            "success": resp.success,
            "message": resp.message,
            "refusal_code": resp.refusal_code,
        }

    async def calibrate_actuator(self, actuator_id: str) -> dict[str, object]:
        """Trigger per-actuator calibration and return results."""
        logger.info("Calibrating actuator {} via sidecar", actuator_id)
        # TODO: call sidecar.CalibrateActuator RPC
        return {}

    async def get_raw_joint_states(self) -> list[JointState]:
        """One-shot snapshot of the current aggregated joint states."""
        # TODO: call sidecar.GetJointStates RPC
        return []

