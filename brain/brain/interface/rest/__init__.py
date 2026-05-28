from brain.interface.rest.actuators import router as actuators_router
from brain.interface.rest.calibrations import router as calibrations_router
from brain.interface.rest.events import router as events_router
from brain.interface.rest.machine import router as machine_router
from brain.interface.rest.mode import router as mode_router
from brain.interface.rest.motion import router as motion_router
from brain.interface.rest.programs import router as programs_router
from brain.interface.rest.state import router as state_router
from brain.interface.rest.templates import router as templates_router

__all__ = [
    "actuators_router",
    "calibrations_router",
    "events_router",
    "machine_router",
    "mode_router",
    "motion_router",
    "programs_router",
    "state_router",
    "templates_router",
]
