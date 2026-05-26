from enum import StrEnum

from pydantic import BaseModel, Field


class MovePrimitive(StrEnum):
    MOVE_J = "move_j"
    MOVE_L = "move_l"
    MOVE_TO_POSE = "move_to_pose"
    FOLLOW_PATH = "follow_path"
    HOLD_POSE = "hold_pose"
    GO_HOME = "go_home"


class Pose(BaseModel):
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    orientation_quat: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 1.0])


class MoveCommand(BaseModel):
    primitive: MovePrimitive
    joint_targets: dict[str, float] = Field(
        default_factory=dict,
        description="Joint name → target angle (rad); used by MOVE_J",
    )
    target_pose: Pose | None = None
    waypoints: list[Pose] = Field(
        default_factory=list,
        description="Ordered waypoints for FOLLOW_PATH",
    )
    speed_scale: float = Field(default=1.0, ge=0.0, le=1.0)


class JointTrajectoryPoint(BaseModel):
    time_from_start_s: float
    positions: dict[str, float] = Field(default_factory=dict)
    velocities: dict[str, float] = Field(default_factory=dict)


class JointTrajectory(BaseModel):
    machine_id: str
    joint_names: list[str] = Field(default_factory=list)
    points: list[JointTrajectoryPoint] = Field(default_factory=list)


class ActuatorTrajectorySegment(BaseModel):
    """Per-actuator slice of a whole-machine trajectory, sent to the sidecar."""

    actuator_id: str
    joint_name: str
    points: list[JointTrajectoryPoint] = Field(default_factory=list)
    start_time_ns: int = Field(description="Absolute start time (nanoseconds epoch)")
