import json
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field
from sqlalchemy.orm import Mapped, mapped_column

from brain.models.base import SqlBase


class MachineMode(StrEnum):
    OFFLINE = "offline"
    IDLE = "idle"
    MANUAL = "manual"
    RUN = "run"
    FAULT = "fault"
    ESTOPPED = "estopped"


class JointState(BaseModel):
    joint_name: str
    # Joint type — "revolute" | "prismatic".
    # Drives interpretation of position and velocity at render time.
    type: str = "revolute"
    # SI value: radians for revolute, metres for prismatic.
    position: float = 0.0
    # SI value: rad/s for revolute, m/s for prismatic.
    velocity: float = 0.0
    current_a: float = 0.0
    temperature_c: float = 0.0
    fault: str | None = None

    @classmethod
    def from_legacy(cls, data: dict) -> "JointState":
        """
        Upgrade a stored dict that uses the pre-Phase-5 field names
        (angle_rad / velocity_rad_s) to the current schema.
        """
        return cls(
            joint_name=data.get("joint_name", ""),
            type=data.get("type", "revolute"),
            position=data.get("position", data.get("angle_rad", 0.0)),
            velocity=data.get("velocity", data.get("velocity_rad_s", 0.0)),
            current_a=data.get("current_a", 0.0),
            temperature_c=data.get("temperature_c", 0.0),
            fault=data.get("fault"),
        )


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


class SqlModeEvent(SqlBase):
    __tablename__ = "mode_events"

    machine_id: Mapped[str] = mapped_column(nullable=False, index=True)
    event_json: Mapped[str] = mapped_column(nullable=False)

    def to_event(self) -> ModeEvent:
        return ModeEvent.model_validate(json.loads(self.event_json))
