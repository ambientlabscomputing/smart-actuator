from abc import ABC, abstractmethod

from brain import Config
from brain.repository.repository import Repository
from brain.service.actuator_service import ActuatorService
from brain.service.calibration_service import CalibrationService
from brain.service.hardware_lifecycle_service import HardwareLifecycleService
from brain.service.kinematics_service import KinematicsService
from brain.service.lifecycle_service import LifecycleService
from brain.service.machine_service import MachineService
from brain.service.motion_service import MotionService
from brain.service.oauth_service import OAuthService
from brain.service.observability_service import ObservabilityService
from brain.service.program_service import ProgramService
from brain.service.safety_service import SafetyService
from brain.service.sidecar_bridge import SidecarBridge
from brain.service.sim_lifecycle_service import SimLifecycleService
from brain.service.state_service import StateService
from brain.service.file_service import FileService
from brain.service.gcode_service import GCodeService
from brain.service.template_service import TemplateService
from brain.service.user_service import UserService
from brain.service.workspace_service import WorkspaceService
from brain.utils.logger import logger


class Service(ABC):
    @abstractmethod
    async def start(self) -> None:
        pass

    @abstractmethod
    async def stop(self) -> None:
        pass


class BrainService(Service):
    """
    Top-level coordinator.  Owns and wires together every sub-service;
    all external interfaces (REST, gRPC, ROS) enter through here.
    """

    def __init__(
        self,
        repository: Repository,
        config: Config,
        sidecar: SidecarBridge,
        templates: TemplateService,
        actuators: ActuatorService,
        machine: MachineService,
        kinematics: KinematicsService,
        workspace: WorkspaceService,
        motion: MotionService,
        safety: SafetyService,
        state: StateService,
        programs: ProgramService,
        lifecycle: LifecycleService,
        calibration: CalibrationService,
        observability: ObservabilityService,
        user_service: UserService,
        oauth_service: OAuthService,
        file_service: FileService,
        gcode: GCodeService,
        sim_lifecycle: SimLifecycleService | None = None,
        hardware_lifecycle: HardwareLifecycleService | None = None,
    ) -> None:
        self.repository = repository
        self.config = config
        self.sidecar = sidecar
        self.templates = templates
        self.actuators = actuators
        self.machine = machine
        self.kinematics = kinematics
        self.workspace = workspace
        self.motion = motion
        self.safety = safety
        self.state = state
        self.programs = programs
        self.lifecycle = lifecycle
        self.calibration = calibration
        self.observability = observability
        self.sim_lifecycle = sim_lifecycle
        self.hardware_lifecycle = hardware_lifecycle
        self.user_service = user_service
        self.oauth_service = oauth_service
        self.file_service = file_service
        self.gcode = gcode

    async def start(self) -> None:
        logger.info("Starting BrainService")
        await self.repository.start()
        await self.user_service.start()
        await self.sidecar.connect()
        await self.state.start()
        await self.calibration.start()
        await self.programs.start()
        if self.sim_lifecycle is not None or self.hardware_lifecycle is not None:
            try:
                sidecar_ready = await self.sidecar.wait_until_ready(timeout=30.0)
                if not sidecar_ready:
                    logger.warning("Sidecar not reachable after 30s — skipping recovery")
                else:
                    if self.sim_lifecycle is not None:
                        await self.sim_lifecycle.recover_on_start()
                    if self.hardware_lifecycle is not None:
                        await self.hardware_lifecycle.recover_on_start()
            except Exception:
                logger.exception("Lifecycle recovery failed — continuing")

    async def stop(self) -> None:
        logger.info("Stopping BrainService")
        await self.sidecar.disconnect()
        await self.repository.stop()
