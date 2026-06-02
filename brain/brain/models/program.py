from __future__ import annotations

import json
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Mapped, mapped_column

from brain.models.base import SqlBase


class NodeKind(StrEnum):
    SEQUENCE = "sequence"
    CONDITIONAL = "conditional"
    LOOP = "loop"
    MOVE = "move"
    MOVE_SE3 = "move_se3"
    WAIT = "wait"
    SENSOR_READ = "sensor_read"
    MODE_TRANSITION = "mode_transition"
    SUB_PROGRAM = "sub_program"


class ProgramNode(BaseModel):
    kind: NodeKind
    children: list[ProgramNode] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Node-kind-specific parameters.\n"
            "  MOVE: {joint_name: str, target_rad: float}\n"
            "  MOVE_SE3: {position: [x, y, z], orientation_quat: [x, y, z, w]}\n"
            "  WAIT: {duration_s: float}"
        ),
    )


class ProgramMeta(BaseModel):
    program_id: str
    name: str
    description: str = ""


class Program(BaseModel):
    """
    A named, persistable program expressed as an AST.
    The Web UI block editor is a view over this AST; external agents drive
    the Brain via gRPC rather than by emitting the AST directly.
    """

    meta: ProgramMeta
    machine_id: str = Field(description="Machine description this program is typed against")
    root: ProgramNode


# Rebuild for forward reference in ProgramNode.children
ProgramNode.model_rebuild()


# ── Program run state ─────────────────────────────────────────────────────────


class ProgramRunStatus(StrEnum):
    pending = "pending"
    running = "running"
    stopped = "stopped"
    completed = "completed"
    faulted = "faulted"
    interrupted = "interrupted"


class ProgramRunState(BaseModel):
    """Runtime state of a single program execution (mirrors CalibrationJobState)."""

    run_id: str
    program_id: str
    machine_id: str
    status: ProgramRunStatus
    current_step_index: int = 0
    total_steps: int = 0
    current_node_id: str = ""
    error: str = ""
    created_at: int = 0
    updated_at: int = 0


class SqlProgram(SqlBase):
    __tablename__ = "programs"

    program_id: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    data_json: Mapped[str] = mapped_column(nullable=False)

    def to_program(self) -> Program:
        return Program.model_validate(json.loads(self.data_json))


class SqlProgramRun(SqlBase):
    __tablename__ = "program_runs"

    run_id: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    program_id: Mapped[str] = mapped_column(nullable=False, index=True)
    machine_id: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False)
    current_step_index: Mapped[int] = mapped_column(nullable=False, default=0)
    total_steps: Mapped[int] = mapped_column(nullable=False, default=0)
    current_node_id: Mapped[str] = mapped_column(nullable=False, default="")
    error: Mapped[str] = mapped_column(nullable=False, default="")

    def to_state(self) -> ProgramRunState:
        return ProgramRunState(
            run_id=self.run_id,
            program_id=self.program_id,
            machine_id=self.machine_id,
            status=ProgramRunStatus(self.status),
            current_step_index=self.current_step_index,
            total_steps=self.total_steps,
            current_node_id=self.current_node_id,
            error=self.error,
        )
