from actuator_sim.service.service import AppService, Service
from actuator_sim.utils.config import ActuatorConfig


def new_service(config: ActuatorConfig) -> Service:
    return AppService(config)
