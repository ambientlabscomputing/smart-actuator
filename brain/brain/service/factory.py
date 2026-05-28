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
from brain.service.service import BrainService
from brain.service.sidecar_bridge import SidecarBridge
from brain.service.sim_lifecycle_service import SimLifecycleService
from brain.service.state_service import StateService
from brain.service.template_service import TemplateService


def new_brain_service(config: Config) -> BrainService:
    repository = Repository(config.db_path)
    sidecar = SidecarBridge(config)
    observability = ObservabilityService(config)
    templates = TemplateService(config)
    sim_lifecycle = SimLifecycleService(
        repository, config, sidecar_bridge=sidecar, observability=observability
    )
    kinematics = KinematicsService(repository, config)
    machine = MachineService(repository, templates, config, sim_lifecycle=sim_lifecycle)
    actuators = ActuatorService(repository, sidecar, config)
    lifecycle = LifecycleService(repository, config)
    safety = SafetyService(repository, sidecar, kinematics, lifecycle, config)
    motion = MotionService(repository, sidecar, kinematics, config)
    state = StateService(repository, sidecar, kinematics, lifecycle, config)
    programs = ProgramService(repository, config, motion=motion, state=state, lifecycle=lifecycle, observability=observability)
    calibration = CalibrationService(repository, config, observability=observability)

    return BrainService(
        repository=repository,
        config=config,
        sidecar=sidecar,
        templates=templates,
        actuators=actuators,
        machine=machine,
        kinematics=kinematics,
        motion=motion,
        safety=safety,
        state=state,
        programs=programs,
        lifecycle=lifecycle,
        calibration=calibration,
        observability=observability,
        sim_lifecycle=sim_lifecycle,
    )
