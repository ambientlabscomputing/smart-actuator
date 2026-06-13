from brain import Config
from brain.models.gcode import _rebuild_translation_result
from brain.repository.repository import Repository
from brain.service.actuator_service import ActuatorService
from brain.service.calibration_service import CalibrationService
from brain.service.file_service import FileService
from brain.service.gcode_service import GCodeService
from brain.service.hardware_lifecycle_service import HardwareLifecycleService
from brain.service.kinematics_service import KinematicsService
from brain.service.lifecycle_service import LifecycleService
from brain.service.machine_service import MachineService
from brain.service.motion_service import MotionService
from brain.service.oauth_service import OAuthService
from brain.service.observability_service import ObservabilityService
from brain.service.program_service import ProgramService
from brain.service.safety_service import SafetyService
from brain.service.service import BrainService
from brain.service.sidecar_bridge import SidecarBridge
from brain.service.sim_lifecycle_service import SimLifecycleService
from brain.service.state_service import StateService
from brain.service.teach_service import TeachService
from brain.service.template_service import TemplateService

# Resolve the forward-reference `Program` inside GCodeTranslationResult so
# Pydantic v2 can fully validate the model at runtime.
_rebuild_translation_result()
from brain.service.user_service import UserService
from brain.service.workspace_service import WorkspaceService


def new_brain_service(config: Config) -> BrainService:
    repository = Repository()
    sidecar = SidecarBridge(config)
    observability = ObservabilityService(config)
    templates = TemplateService(config)
    sim_lifecycle = SimLifecycleService(
        repository, config, sidecar_bridge=sidecar, observability=observability
    )
    hardware_lifecycle = HardwareLifecycleService(
        repository, config, sidecar_bridge=sidecar, observability=observability
    )
    kinematics = KinematicsService(repository, config, templates=templates)
    workspace = WorkspaceService(repository, kinematics, templates, config)
    machine = MachineService(
        repository,
        templates,
        config,
        sim_lifecycle=sim_lifecycle,
        hardware_lifecycle=hardware_lifecycle,
        workspace=workspace,
        sidecar=sidecar,
    )
    actuators = ActuatorService(repository, sidecar, config)
    lifecycle = LifecycleService(repository, config)
    safety = SafetyService(repository, sidecar, kinematics, lifecycle, config, workspace=workspace)
    motion = MotionService(
        repository, sidecar, kinematics, config, workspace=workspace, safety=safety
    )
    state = StateService(repository, sidecar, kinematics, lifecycle, config)
    programs = ProgramService(
        repository,
        config,
        motion=motion,
        state=state,
        lifecycle=lifecycle,
        observability=observability,
        kinematics=kinematics,
    )
    calibration = CalibrationService(repository, config, observability=observability)
    user_service = UserService(repository, config)
    oauth_service = OAuthService(repository, config)
    file_service = FileService(repository, config)
    gcode = GCodeService(file_service, programs)
    teach = TeachService(
        repository,
        config,
        state=state,
        programs=programs,
        observability=observability,
    )

    return BrainService(
        repository=repository,
        config=config,
        sidecar=sidecar,
        templates=templates,
        actuators=actuators,
        machine=machine,
        kinematics=kinematics,
        workspace=workspace,
        motion=motion,
        safety=safety,
        state=state,
        programs=programs,
        lifecycle=lifecycle,
        calibration=calibration,
        observability=observability,
        sim_lifecycle=sim_lifecycle,
        hardware_lifecycle=hardware_lifecycle,
        user_service=user_service,
        oauth_service=oauth_service,
        file_service=file_service,
        gcode=gcode,
        teach=teach,
    )
