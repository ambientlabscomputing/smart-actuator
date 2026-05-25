from abc import ABC, abstractmethod
from actuator_sim.utils.config import ActuatorConfig
from actuator_sim import logger
from actuator_sim.models import (
    SetPositionRequest,
    SetVelocityRequest,
    SetTorqueRequest,
    CommandResponse,
    PositionResponse,
    VelocityResponse,
    CurrentResponse,
)


class Service(ABC):
    @abstractmethod
    async def start(self):
        pass

    @abstractmethod
    async def stop(self):
        pass

    # ── Command methods ──────────────────────────────────────────────────────

    @abstractmethod
    async def set_position(self, request: SetPositionRequest) -> CommandResponse:
        """Set the target position."""

    @abstractmethod
    async def set_velocity(self, request: SetVelocityRequest) -> CommandResponse:
        """Set the target velocity."""

    @abstractmethod
    async def set_torque(self, request: SetTorqueRequest) -> CommandResponse:
        """Set the target torque."""

    # ── Telemetry methods ────────────────────────────────────────────────────

    @abstractmethod
    async def read_position(self) -> PositionResponse:
        """Return the current position."""

    @abstractmethod
    async def read_velocity(self) -> VelocityResponse:
        """Return the current velocity."""

    @abstractmethod
    async def read_current(self) -> CurrentResponse:
        """Return the current draw."""


class AppService(Service):
    def __init__(self, config: ActuatorConfig):
        self.config = config
        self._position: float = 0.0
        self._velocity: float = 0.0
        self._torque: float = 0.0

    async def start(self):
        logger.info("Starting App Service")

    async def stop(self):
        logger.info("Stopping App Service")

    async def set_position(self, request: SetPositionRequest) -> CommandResponse:
        logger.debug("set_position: {}", request.angle)
        self._position = request.angle
        return CommandResponse(success=True, message="Position set")

    async def set_velocity(self, request: SetVelocityRequest) -> CommandResponse:
        logger.debug("set_velocity: {}", request.velocity)
        self._velocity = request.velocity
        return CommandResponse(success=True, message="Velocity set")

    async def set_torque(self, request: SetTorqueRequest) -> CommandResponse:
        logger.debug("set_torque: {}", request.torque)
        self._torque = request.torque
        return CommandResponse(success=True, message="Torque set")

    async def read_position(self) -> PositionResponse:
        return PositionResponse(angle=self._position)

    async def read_velocity(self) -> VelocityResponse:
        return VelocityResponse(velocity=self._velocity)

    async def read_current(self) -> CurrentResponse:
        # Stub: real hardware would query a current sensor
        return CurrentResponse(current=0.0)
