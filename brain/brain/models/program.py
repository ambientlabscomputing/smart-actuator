from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class NodeKind(StrEnum):
    SEQUENCE = "sequence"
    CONDITIONAL = "conditional"
    LOOP = "loop"
    MOVE = "move"
    WAIT = "wait"
    SENSOR_READ = "sensor_read"
    MODE_TRANSITION = "mode_transition"
    SUB_PROGRAM = "sub_program"


class ProgramNode(BaseModel):
    kind: NodeKind
    children: list[ProgramNode] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(
        default_factory=dict,
        description="Node-kind-specific parameters (e.g. joint targets, wait duration)",
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
