from enum import StrEnum

from pydantic import BaseModel


class ActuatorHealth(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    FAULT = "fault"
    UNKNOWN = "unknown"


class Actuator(BaseModel):
    id: str
    name: str
    firmware_version: str = ""
    health: ActuatorHealth = ActuatorHealth.UNKNOWN
    is_simulated: bool = False
