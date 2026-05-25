import grpc
import grpc.aio

from actuator_sim import logger
from actuator_sim.interface import actuator_pb2, actuator_pb2_grpc
from actuator_sim.models import (
    SetPositionRequest,
    SetTorqueRequest,
    SetVelocityRequest,
)
from actuator_sim.service.service import Service
from actuator_sim.utils.config import ActuatorConfig


class ActuatorServicer(actuator_pb2_grpc.ActuatorServiceServicer):
    """Translates proto messages → domain models, calls Service, translates back."""

    def __init__(self, service: Service):
        self._service = service

    # ── Command RPCs ────────────────────────────────────────────────────────

    async def SetPosition(
        self,
        request: actuator_pb2.SetPositionRequest,
        context: grpc.aio.ServicerContext,
    ) -> actuator_pb2.CommandResponse:
        resp = await self._service.set_position(SetPositionRequest(angle=request.angle))
        return actuator_pb2.CommandResponse(success=resp.success, message=resp.message)

    async def SetVelocity(
        self,
        request: actuator_pb2.SetVelocityRequest,
        context: grpc.aio.ServicerContext,
    ) -> actuator_pb2.CommandResponse:
        resp = await self._service.set_velocity(SetVelocityRequest(velocity=request.velocity))
        return actuator_pb2.CommandResponse(success=resp.success, message=resp.message)

    async def SetTorque(
        self,
        request: actuator_pb2.SetTorqueRequest,
        context: grpc.aio.ServicerContext,
    ) -> actuator_pb2.CommandResponse:
        resp = await self._service.set_torque(SetTorqueRequest(torque=request.torque))
        return actuator_pb2.CommandResponse(success=resp.success, message=resp.message)

    # ── Telemetry RPCs ──────────────────────────────────────────────────────

    async def ReadPosition(
        self,
        request: actuator_pb2.ReadRequest,
        context: grpc.aio.ServicerContext,
    ) -> actuator_pb2.PositionResponse:
        resp = await self._service.read_position()
        return actuator_pb2.PositionResponse(angle=resp.angle)

    async def ReadVelocity(
        self,
        request: actuator_pb2.ReadRequest,
        context: grpc.aio.ServicerContext,
    ) -> actuator_pb2.VelocityResponse:
        resp = await self._service.read_velocity()
        return actuator_pb2.VelocityResponse(velocity=resp.velocity)

    async def ReadCurrent(
        self,
        request: actuator_pb2.ReadRequest,
        context: grpc.aio.ServicerContext,
    ) -> actuator_pb2.CurrentResponse:
        resp = await self._service.read_current()
        return actuator_pb2.CurrentResponse(current=resp.current)


class Interface:
    """gRPC server wrapper for the actuator simulator."""

    def __init__(self, config: ActuatorConfig, service: Service):
        self.config = config
        self.service = service
        self._server: grpc.aio.Server | None = None

    async def start(self):
        """Start the gRPC server (non-blocking)."""
        self._server = grpc.aio.server()
        actuator_pb2_grpc.add_ActuatorServiceServicer_to_server(
            ActuatorServicer(self.service), self._server
        )
        listen_addr = f"{self.config.grpc.host}:{self.config.grpc.port}"
        self._server.add_insecure_port(listen_addr)
        logger.info("gRPC server listening on {}", listen_addr)
        await self._server.start()

    async def stop(self):
        """Gracefully stop the gRPC server."""
        if self._server is not None:
            logger.info("Stopping gRPC server")
            await self._server.stop(grace=5)
            self._server = None


def new_interface(config: ActuatorConfig, service: Service) -> Interface:
    """Factory method to create a new Interface instance."""
    return Interface(config, service)
