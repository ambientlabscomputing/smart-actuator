from brain.models.actuator import Actuator
from brain.repository.repository import Repository
from brain.service.sidecar_bridge import SidecarBridge
from brain.utils.config import Config
from brain.utils.logger import logger


class ActuatorService:
    """
    Manages actuator discovery and binding (C1 — actuator side).

    Works with the SidecarBridge to enumerate available actuators and
    exposes the binding surface used during onboarding and machine build.
    """

    def __init__(self, repository: Repository, sidecar: SidecarBridge, config: Config) -> None:
        self._repository = repository
        self._sidecar = sidecar
        self._config = config

    async def list_discovered(self) -> list[Actuator]:
        """Return actuators currently visible to the sidecar."""
        return await self._sidecar.list_actuators()

    async def describe(self, actuator_id: str) -> Actuator | None:
        """Return details for a single actuator."""
        # TODO: fetch from sidecar or repository
        logger.debug("Describing actuator %s", actuator_id)
        return None

    async def set_limit(self, actuator_id: str, limit_name: str, value: float) -> None:
        """Override a per-actuator motion limit."""
        # TODO: persist limit override to repository, push to sidecar
        logger.info("Setting limit %s=%s on actuator %s", limit_name, value, actuator_id)
