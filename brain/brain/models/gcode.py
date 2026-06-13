from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from enum import StrEnum
from typing import TYPE_CHECKING, Literal, Self

from pydantic import BaseModel, Field
from result import Ok, Result

if TYPE_CHECKING:
    from brain.models.program import Program


class GCodeCommand(StrEnum):
    # supported commands
    G0 = "G0"  # Rapid positioning
    G1 = "G1"  # Linear interpolation
    G2 = "G2"  # Circular interpolation, clockwise
    G3 = "G3"  # Circular interpolation, counterclockwise
    G20 = "G20"  # Set units to inches
    G21 = "G21"  # Set units to millimeters
    G90 = "G90"  # Absolute programming
    G91 = "G91"  # Incremental programming

    # future support
    # G28 = "G28"  # Return to home position
    # M3 = "M3"  # Spindle on (clockwise)
    # M4 = "M4"  # Spindle on (counterclockwise)
    # M5 = "M5"  # Spindle off


class BaseGCodeCommand(BaseModel, ABC):
    command: GCodeCommand

    @classmethod
    @abstractmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        pass


class G0Params(BaseModel):
    x: float | None = None
    y: float | None = None
    z: float | None = None


class G0(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G0
    params: G0Params

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        # Example line: "G0 X10 Y20 Z30"
        parts = line.split()
        params = G0Params()
        for part in parts[1:]:  # skip the command part
            axis = part[0].upper()
            value = float(part[1:])
            if axis == "X":
                params.x = value
            elif axis == "Y":
                params.y = value
            elif axis == "Z":
                params.z = value
        return Ok(cls(params=params))


class G1Params(BaseModel):
    x: float | None = None
    y: float | None = None
    z: float | None = None
    feed_rate: float | None = None


class G1(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G1
    params: G1Params

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        # Example line: "G1 X10 Y20 Z30 F100"
        parts = line.split()
        params = G1Params()
        for part in parts[1:]:  # skip the command part
            axis = part[0].upper()
            value = float(part[1:])
            if axis == "X":
                params.x = value
            elif axis == "Y":
                params.y = value
            elif axis == "Z":
                params.z = value
            elif axis == "F":
                params.feed_rate = value
        return Ok(cls(params=params))


class G2Params(BaseModel):
    x: float | None = None
    y: float | None = None
    z: float | None = None
    i: float | None = None  # center offset x
    j: float | None = None  # center offset y
    feed_rate: float | None = None


class G2(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G2
    params: G2Params

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        # Example line: "G2 X10 Y20 Z30 I5 J5 F100"
        parts = line.split()
        params = G2Params()
        for part in parts[1:]:  # skip the command part
            axis = part[0].upper()
            value = float(part[1:])
            if axis == "X":
                params.x = value
            elif axis == "Y":
                params.y = value
            elif axis == "Z":
                params.z = value
            elif axis == "I":
                params.i = value
            elif axis == "J":
                params.j = value
            elif axis == "F":
                params.feed_rate = value
        return Ok(cls(params=params))


class G3Params(BaseModel):
    x: float | None = None
    y: float | None = None
    z: float | None = None
    i: float | None = None  # center offset x
    j: float | None = None  # center offset y
    feed_rate: float | None = None


class G3(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G3
    params: G3Params

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        # Example line: "G3 X10 Y20 Z30 I5 J5 F100"
        parts = line.split()
        params = G3Params()
        for part in parts[1:]:  # skip the command part
            axis = part[0].upper()
            value = float(part[1:])
            if axis == "X":
                params.x = value
            elif axis == "Y":
                params.y = value
            elif axis == "Z":
                params.z = value
            elif axis == "I":
                params.i = value
            elif axis == "J":
                params.j = value
            elif axis == "F":
                params.feed_rate = value
        return Ok(cls(params=params))


class G20(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G20

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        return Ok(cls())


class G21(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G21

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        return Ok(cls())


class G90(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G90

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        return Ok(cls())


class G91(BaseGCodeCommand):
    command: GCodeCommand = GCodeCommand.G91

    @classmethod
    def parse_from_line(cls, line: str) -> Result[Self, str]:
        return Ok(cls())


class GCodeProgram(BaseModel):
    """
    A simple representation of a G-code program as a list of commands.
    This is not intended to be a full G-code parser, but rather a way to
    represent a limited subset of G-code commands for execution by the Brain.
    """

    commands: list[BaseGCodeCommand]


CMD_MAPPINGS: dict[GCodeCommand, type[BaseGCodeCommand]] = {
    GCodeCommand.G0: G0,
    GCodeCommand.G1: G1,
    GCodeCommand.G2: G2,
    GCodeCommand.G3: G3,
    GCodeCommand.G20: G20,
    GCodeCommand.G21: G21,
    GCodeCommand.G90: G90,
    GCodeCommand.G91: G91,
}


def get_command_model(cmd: str | GCodeCommand) -> type[BaseGCodeCommand] | None:
    try:
        cmd_enum = GCodeCommand(cmd)
        return CMD_MAPPINGS.get(cmd_enum)
    except ValueError:
        return None


# ── Translation models ────────────────────────────────────────────────────────


class GantrySampleRequest(BaseModel):
    """Request body for ``POST /gcode/samples``."""

    name: str = Field(description="Sample name — one of the SAMPLE_NAMES values.")
    machine_id: str = Field(description="Machine the program will execute on.")
    program_name: str = Field(
        default="Gantry sample", description="Human-readable name for the saved Program."
    )
    description: str = Field(default="", description="Optional program description.")
    origin_mm: list[float] = Field(
        default_factory=lambda: [150.0, 150.0, 150.0],
        description="[cx, cy, work_z] — pattern centre (XY) and working Z in mm. "
        "Set cx = width_mm/2, cy = height_mm/2 to keep the pattern in the positive quadrant.",
    )
    width_mm: float = Field(default=200.0, gt=1.0, description="Bounding-box width along X (mm).")
    height_mm: float = Field(default=200.0, gt=1.0, description="Bounding-box height along Y (mm).")
    orientation_quat: list[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0, 1.0],
        description="Tool orientation applied to every pose (x, y, z, w). Default is identity.",
    )
    chord_tolerance_mm: float = Field(default=0.1, gt=0, description="Arc chord tolerance (mm).")
    arc_plane: Literal["xy", "xz", "yz"] = Field(
        default="xy", description="Arc interpolation plane."
    )


class GCodeTranslationRequest(BaseModel):
    file_id: int = Field(description="ID of the uploaded G-code StoredFile to translate.")
    program_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="UUID to use for the resulting Program. Defaults to a new random UUID.",
    )
    name: str = Field(description="Human-readable name for the resulting Program.")
    description: str = Field(default="", description="Optional description for the Program.")
    machine_id: str = Field(description="Machine the program will be executed on.")
    orientation_quat: list[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0, 1.0],
        description="Tool orientation applied to every MOVE_SE3 pose (x, y, z, w). Default is identity.",
    )
    start_position: list[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0],
        description="Initial cursor position in mm (x, y, z) before the first G-code move.",
    )
    chord_tolerance_mm: float = Field(
        default=0.1,
        gt=0,
        description="Maximum chord deviation when sampling G2/G3 arcs (mm). Smaller = more points.",
    )
    arc_plane: Literal["xy", "xz", "yz"] = Field(
        default="xy",
        description="Active plane for G2/G3 circular interpolation.",
    )


class GCodeTranslationResult(BaseModel):
    """Returned by the translate endpoint. program is ready to persist and run."""

    program: Program  # type: ignore[type-arg]  # resolved at runtime via model_rebuild
    pose_count: int = Field(description="Number of MOVE_SE3 nodes in the program.")
    warnings: list[str] = Field(
        default_factory=list,
        description="Non-fatal notices produced during translation (unit changes, unrecognised commands, etc.).",
    )
    dropped_lines: list[tuple[int, str]] = Field(
        default_factory=list,
        description="(1-based line number, error message) for lines that could not be parsed.",
    )


class GCodePreview(BaseModel):
    """Lightweight preview of the translated path — no full Program AST."""

    positions: list[list[float]] = Field(
        description="[x, y, z] in mm for each sampled waypoint (may be truncated).",
    )
    motion_types: list[str] = Field(
        description="'rapid' | 'feed' | 'arc' for each waypoint, parallel to positions.",
    )
    warnings: list[str] = Field(default_factory=list)
    truncated: bool = Field(
        default=False,
        description="True when pose_count > the preview cap and positions has been shortened.",
    )
    pose_count: int = Field(description="Total pose count before any truncation.")


# Deferred rebuild so GCodeTranslationResult.program resolves at import time.
def _rebuild_translation_result() -> None:
    from brain.models.program import Program  # noqa: F401 — needed for model_rebuild namespace

    GCodeTranslationResult.model_rebuild(_types_namespace={"Program": Program})
