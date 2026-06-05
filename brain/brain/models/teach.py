"""
Teach-mode session model (RFD-13).

A teach session captures a sequence of Waypoints — discrete joint-space
poses the user explicitly marks — and materialises them as a Program
(root SEQUENCE of MOVE nodes) when saved.

State machine:
  idle → armed → recording → saved
                           ↘ aborted
  Any state → aborted (via abort())
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field
from sqlalchemy.orm import Mapped, mapped_column

from brain.models.base import SqlBase


class TeachStatus(StrEnum):
    idle = "idle"
    armed = "armed"
    recording = "recording"
    saved = "saved"
    aborted = "aborted"


class TeachMode(StrEnum):
    live = "live"
    drag = "drag"


class Waypoint(BaseModel):
    """
    A single captured pose.

    ``joint_positions`` maps joint_name → position in SI units (radians for
    revolute, metres for prismatic).

    ``position`` and ``orientation_quat`` are the SE(3) end-effector pose
    computed via FK at capture time. When present, the waypoint is replayed
    as a MOVE_SE3 (Cartesian) node, which lets the runtime solve IK fresh
    against the current machine state instead of replaying recorded joint
    angles verbatim. Joint angles are still kept for diagnostics + as a
    fallback when no DH chain is available.

    ``velocity`` is reserved for future LFD work and is always None in v1.
    """

    joint_positions: dict[str, float]
    position: list[float] | None = Field(
        default=None,
        description="EE world-frame position [x, y, z] (metres) at capture time.",
    )
    orientation_quat: list[float] | None = Field(
        default=None,
        description="EE world-frame orientation as quaternion [x, y, z, w].",
    )
    captured_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    label: str | None = None
    velocity: dict[str, float] | None = None


class TeachSessionState(BaseModel):
    session_id: str
    machine_id: str
    mode: TeachMode
    status: TeachStatus
    waypoints: list[Waypoint] = Field(default_factory=list)
    error: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    program_id: str | None = None


# ── SQLAlchemy persistence ────────────────────────────────────────────────────


class SqlTeachSession(SqlBase):
    __tablename__ = "teach_sessions"

    session_id: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    machine_id: Mapped[str] = mapped_column(nullable=False, index=True)
    status: Mapped[str] = mapped_column(nullable=False)
    data_json: Mapped[str] = mapped_column(nullable=False)

    def to_state(self) -> TeachSessionState:
        return TeachSessionState.model_validate(json.loads(self.data_json))
