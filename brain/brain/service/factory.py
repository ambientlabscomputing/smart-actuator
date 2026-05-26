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
from brain.service.ros_gateway import RosGateway
from brain.service.safety_service import SafetyService
from brain.service.service import BrainService
from brain.service.sidecar_bridge import SidecarBridge
from brain.service.state_service import StateService
from brain.service.template_service import TemplateService


def new_brain_service(config: Config) -> BrainService:
    repository = Repository()
    sidecar = SidecarBridge(config)
    templates = TemplateService(config)
    kinematics = KinematicsService(repository, config)
    machine = MachineService(repository, templates, config)
    actuators = ActuatorService(repository, sidecar, config)
    safety = SafetyService(repository, sidecar, kinematics, config)
    motion = MotionService(repository, sidecar, kinematics, config)
    state = StateService(repository, sidecar, kinematics, config)
    lifecycle = LifecycleService(repository, config)
    programs = ProgramService(repository, config)
    calibration = CalibrationService(repository, sidecar, lifecycle, config)
    ros = RosGateway(config)
    observability = ObservabilityService(config)

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
        ros=ros,
        observability=observability,
    )
