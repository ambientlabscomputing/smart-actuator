from brain.models.motion import Pose
from brain.repository.repository import Repository
from brain.service.lifecycle_service import LifecycleService
from brain.service.sidecar_bridge import SidecarBridge
from brain.utils.config import Config
from brain.utils.logger import logger


class CalibrationService:
    """
    Onboarding and calibration flows (C8).

    Drives the "discover → describe → calibrate → test" onboarding sequence.
    Supports a simulated-bind path where the machine description is bound to
    actuator-sim instances instead of real hardware — the Brain does not
    distinguish between the two paths.
    """

    def __init__(
        self,
        repository: Repository,
        sidecar: SidecarBridge,
        lifecycle: LifecycleService,
        config: Config,
    ) -> None:
        self._repository = repository
        self._sidecar = sidecar
        self._lifecycle = lifecycle
        self._config = config

    async def start_onboarding(self, machine_id: str) -> None:
        """
        Begin the onboarding flow for *machine_id*.
        Transitions the machine to IDLE once actuators are discovered and bound.
        """
        logger.info("Starting onboarding for machine %s", machine_id)
        # TODO: enumerate actuators, prompt for description, bind in order

    async def calibrate_actuator(self, machine_id: str, actuator_id: str) -> dict[str, object]:
        """
        Trigger per-actuator calibration via the sidecar and return the result.
        """
        logger.info("Calibrating actuator %s (machine %s)", actuator_id, machine_id)
        result = await self._sidecar.calibrate_actuator(actuator_id)
        # TODO: persist calibration data to repository
        return result

    async def calibrate_tool_frame(self, machine_id: str, measurements: list[Pose]) -> Pose:
        """
        Compute the tool-center-point frame from a set of measurement poses
        (e.g. four-point sphere fit or three-plane method).
        """
        # TODO: implement frame calibration algorithm
        logger.info("Calibrating tool frame for machine %s", machine_id)
        return Pose()

    async def calibrate_base_frame(self, machine_id: str, measurements: list[Pose]) -> Pose:
        """
        Compute the robot base frame in the world frame from measurement poses.
        """
        # TODO: implement base-frame alignment algorithm
        logger.info("Calibrating base frame for machine %s", machine_id)
        return Pose()

    async def get_calibration(self, machine_id: str) -> dict[str, object]:
        """Return stored calibration data for the machine."""
        # TODO: load from repository
        return {}
