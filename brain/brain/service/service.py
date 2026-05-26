from abc import ABC, abstractmethod

from brain import Config
from brain.repository.repository import Repository
from brain.service.actuator_service import ActuatorService
from brain.service.calibration_service import CalibrationService
from brain.service.kinematics_service import KinematicsService
from brain.service.lifecycle_service import LifecycleService
from brain.service.machine_service import MachineService
from brain.service.motion_service import MotionService
from brain.service.observability_service import ObservabilityService
from brain.service.program_service import ProgramService
from brain.service.safety_service import SafetyService
from brain.service.sidecar_bridge import SidecarBridge
from brain.service.state_service import StateService
from brain.service.template_service import TemplateService
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
        motion: MotionService,
        safety: SafetyService,
        state: StateService,
        programs: ProgramService,
        lifecycle: LifecycleService,
        calibration: CalibrationService,
        observability: ObservabilityService,
    ) -> None:
        self.repository = repository
        self.config = config
        self.sidecar = sidecar
        self.templates = templates
        self.actuators = actuators
        self.machine = machine
        self.kinematics = kinematics
        self.motion = motion
        self.safety = safety
        self.state = state
        self.programs = programs
        self.lifecycle = lifecycle
        self.calibration = calibration
        self.observability = observability

    async def start(self) -> None:
        logger.info("Starting BrainService")
        await self.sidecar.connect()
        await self.state.start()

    async def stop(self) -> None:
        logger.info("Stopping BrainService")
        await self.sidecar.disconnect()
