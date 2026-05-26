from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class MachineMode(StrEnum):
    OFFLINE = "offline"
    IDLE = "idle"
    MANUAL = "manual"
    RUN = "run"
    FAULT = "fault"


class JointState(BaseModel):
    joint_name: str
    angle_rad: float = 0.0
    velocity_rad_s: float = 0.0
    current_a: float = 0.0
    fault: str | None = None


class LinkPose(BaseModel):
    link_name: str
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    orientation_quat: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 1.0])


class MachineState(BaseModel):
    machine_id: str
    mode: MachineMode = MachineMode.OFFLINE
    measured: list[JointState] = Field(
        default_factory=list,
        description="Raw joint states from the sidecar",
    )
    modeled: list[LinkPose] = Field(
        default_factory=list,
        description="Forward-kinematic link poses computed by the Brain",
    )
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ModeEvent(BaseModel):
    machine_id: str
    previous_mode: MachineMode
    new_mode: MachineMode
    reason: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
