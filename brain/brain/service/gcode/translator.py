"""
G-code → Program AST translator.

Pure functions — no I/O, no async.  Accepts a list of parsed BaseGCodeCommand
objects (from parser.parse_gcode) and a GCodeTranslationRequest and emits a
GCodeTranslationResult containing a Program whose root is a SEQUENCE of
MOVE_SE3 nodes.

Each MOVE_SE3 node carries the standard position / orientation_quat attributes
plus three extra keys that ProgramService passes through without interpreting:
  motion_type         : 'rapid' | 'feed' | 'arc'
  feed_rate_mm_per_min: float | None
  source_line         : int   (1-based line in the original file)

Arc interpolation (G2/G3):
  Points are sampled such that the sagitta (chord deviation from the true arc)
  never exceeds chord_tolerance_mm.  Formula: theta_max = 2*acos(1 - tol/r).
  Z is linearly interpolated (helical arcs).  Only the XY / XZ / YZ planes are
  supported — matching the arc_plane field of the request.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Literal

from brain.models.gcode import (
    G0,
    G1,
    G2,
    G3,
    G20,
    G21,
    G90,
    G91,
    GCodePreview,
    GCodeTranslationRequest,
    GCodeTranslationResult,
)
from brain.models.program import NodeKind, Program, ProgramMeta, ProgramNode

if TYPE_CHECKING:
    from brain.models.gcode import BaseGCodeCommand

# ── Constants ─────────────────────────────────────────────────────────────────

_INCH_TO_MM: float = 25.4
_MM_TO_M: float = 1e-3
_MAX_PREVIEW_POSES: int = 2_000

# ── Types ─────────────────────────────────────────────────────────────────────

Point3 = tuple[float, float, float]
_Units = Literal["mm", "inch"]
_Mode = Literal["absolute", "incremental"]
_Plane = Literal["xy", "xz", "yz"]

# ── Unit helpers ──────────────────────────────────────────────────────────────


def _to_mm(value: float, units: _Units) -> float:
    return value * _INCH_TO_MM if units == "inch" else value


def _resolve_axis(current: float, value: float | None, mode: _Mode, units: _Units) -> float:
    """Return the new absolute mm value for one axis, given current state."""
    if value is None:
        return current
    v = _to_mm(value, units)
    return current + v if mode == "incremental" else v


def _apply_move(
    pos: list[float],
    x: float | None,
    y: float | None,
    z: float | None,
    mode: _Mode,
    units: _Units,
) -> list[float]:
    """Return a new [x, y, z] list after applying an XYZ move command."""
    return [
        _resolve_axis(pos[0], x, mode, units),
        _resolve_axis(pos[1], y, mode, units),
        _resolve_axis(pos[2], z, mode, units),
    ]


# ── Arc sampler ───────────────────────────────────────────────────────────────


def _sample_arc(
    start: Point3,
    end: Point3,
    i_offset: float,
    j_offset: float,
    plane: _Plane,
    clockwise: bool,
    chord_tol: float,
) -> list[Point3]:
    """
    Sample a circular arc from *start* to *end*.

    *i_offset* and *j_offset* are the center offsets along the two in-plane
    axes (always relative to *start*).  *plane* selects which world axes are
    the two in-plane axes: 'xy' → (X,Y,Z), 'xz' → (X,Z,Y), 'yz' → (Y,Z,X).

    Returns N sampled points (including the endpoint, excluding the start).
    Falls back to a single straight-line step when the radius is too small
    relative to the chord tolerance.
    """
    # Map plane → axis indices (first, second, out-of-plane)
    if plane == "xy":
        ai, bi, ci = 0, 1, 2
    elif plane == "xz":
        ai, bi, ci = 0, 2, 1
    else:  # yz
        ai, bi, ci = 1, 2, 0

    sa, sb, sc = start[ai], start[bi], start[ci]
    ea, eb, ec = end[ai], end[bi], end[ci]
    ca = sa + i_offset
    cb = sb + j_offset

    r = math.hypot(sa - ca, sb - cb)
    if r < chord_tol / 2:
        # Radius is so small that any single straight step satisfies tolerance.
        return [end]

    start_angle = math.atan2(sb - cb, sa - ca)
    end_angle = math.atan2(eb - cb, ea - ca)

    if clockwise:  # G2: decreasing angle
        if end_angle >= start_angle:
            end_angle -= 2 * math.pi
        sweep = end_angle - start_angle  # negative
    else:  # G3: increasing angle
        if end_angle <= start_angle:
            end_angle += 2 * math.pi
        sweep = end_angle - start_angle  # positive

    abs_sweep = abs(sweep)
    # Handle full circle (start == end in the plane)
    if abs_sweep < 1e-9:
        abs_sweep = 2 * math.pi
        sweep = -2 * math.pi if clockwise else 2 * math.pi

    # Maximum angular step: sagitta = r*(1 - cos(θ/2)) ≤ chord_tol
    ratio = min(chord_tol / r, 2.0 - 1e-12)
    theta_max = 2.0 * math.acos(1.0 - ratio)
    n = max(1, math.ceil(abs_sweep / theta_max))

    dc = (ec - sc) / n  # linear out-of-plane (helical) interpolation

    points: list[Point3] = []
    for k in range(1, n + 1):
        t = k / n
        angle = start_angle + t * sweep
        pa = ca + r * math.cos(angle)
        pb = cb + r * math.sin(angle)
        pc = sc + k * dc
        p: list[float] = [0.0, 0.0, 0.0]
        p[ai], p[bi], p[ci] = pa, pb, pc
        points.append((p[0], p[1], p[2]))

    return points


# ── Node builder ──────────────────────────────────────────────────────────────


def _move_se3_node(
    position: Point3,
    orientation_quat: list[float],
    motion_type: str,
    feed_rate_mm_per_min: float | None,
    source_line: int,
) -> ProgramNode:
    return ProgramNode(
        kind=NodeKind.MOVE_SE3,
        children=[],
        attributes={
            "position": list(position),
            "orientation_quat": orientation_quat,
            "motion_type": motion_type,
            "feed_rate_mm_per_min": feed_rate_mm_per_min,
            "source_line": source_line,
        },
    )


# ── Main translator ───────────────────────────────────────────────────────────


def translate(
    commands: list[BaseGCodeCommand],
    request: GCodeTranslationRequest,
    source_lines: list[int] | None = None,
    parser_dropped: list[tuple[int, str]] | None = None,
) -> GCodeTranslationResult:
    """
    Translate a list of parsed G-code commands into a Program AST.

    *source_lines* is a parallel list of 1-based source line numbers (one per
    command).  If omitted, lines are numbered sequentially from 1.

    *parser_dropped* propagates dropped-line records from the parser into the
    returned result's dropped_lines field.
    """
    # ── State cursor ──────────────────────────────────────────────────────────
    units: _Units = "mm"
    mode: _Mode = "absolute"
    pos: list[float] = list(request.start_position[:3])
    while len(pos) < 3:
        pos.append(0.0)
    feed_rate: float = 1000.0  # mm/min default
    orient = list(request.orientation_quat[:4])
    chord_tol = request.chord_tolerance_mm
    plane = request.arc_plane

    nodes: list[ProgramNode] = []
    warnings: list[str] = []

    for idx, cmd in enumerate(commands):
        src = source_lines[idx] if source_lines else idx + 1

        # ── Mode changes ──────────────────────────────────────────────────
        if isinstance(cmd, G20):
            units = "inch"
            warnings.append(
                f"Line {src}: G20 (inch mode) active — positions converted to mm; "
                "verify tool dimensions if mixing inch and mm files."
            )
        elif isinstance(cmd, G21):
            units = "mm"
        elif isinstance(cmd, G90):
            mode = "absolute"
        elif isinstance(cmd, G91):
            mode = "incremental"

        # ── Rapid move (G0) ───────────────────────────────────────────────
        elif isinstance(cmd, G0):
            p = cmd.params
            if p.x is None and p.y is None and p.z is None:
                continue  # no-op
            pos = _apply_move(pos, p.x, p.y, p.z, mode, units)
            pos_m: Point3 = (pos[0] * _MM_TO_M, pos[1] * _MM_TO_M, pos[2] * _MM_TO_M)
            nodes.append(_move_se3_node(pos_m, orient, "rapid", None, src))

        # ── Linear feed (G1) ──────────────────────────────────────────────
        elif isinstance(cmd, G1):
            p = cmd.params
            if p.feed_rate is not None:
                feed_rate = _to_mm(p.feed_rate, units)
            if p.x is None and p.y is None and p.z is None:
                continue  # feed-rate-only line, no motion
            pos = _apply_move(pos, p.x, p.y, p.z, mode, units)
            pos_m = (pos[0] * _MM_TO_M, pos[1] * _MM_TO_M, pos[2] * _MM_TO_M)
            nodes.append(_move_se3_node(pos_m, orient, "feed", feed_rate, src))

        # ── Circular arc (G2 CW / G3 CCW) ────────────────────────────────
        elif isinstance(cmd, (G2, G3)):
            p = cmd.params
            if p.feed_rate is not None:
                feed_rate = _to_mm(p.feed_rate, units)

            end_x = _resolve_axis(pos[0], p.x, mode, units)
            end_y = _resolve_axis(pos[1], p.y, mode, units)
            end_z = _resolve_axis(pos[2], p.z, mode, units)
            end: Point3 = (end_x, end_y, end_z)

            # I / J are always relative to current position, regardless of G90/G91
            i = _to_mm(p.i, units) if p.i is not None else 0.0
            j = _to_mm(p.j, units) if p.j is not None else 0.0

            start: Point3 = (pos[0], pos[1], pos[2])
            clockwise = isinstance(cmd, G2)

            arc_pts = _sample_arc(start, end, i, j, plane, clockwise, chord_tol)
            for ap in arc_pts:
                ap_m: Point3 = (ap[0] * _MM_TO_M, ap[1] * _MM_TO_M, ap[2] * _MM_TO_M)
                nodes.append(_move_se3_node(ap_m, orient, "arc", feed_rate, src))

            pos = list(arc_pts[-1]) if arc_pts else list(end)

        else:
            warnings.append(
                f"Line {src}: command {cmd.command!r} was parsed but has no translation rule — skipped."
            )

    root = ProgramNode(kind=NodeKind.SEQUENCE, children=nodes)
    program = Program(
        meta=ProgramMeta(
            program_id=request.program_id,
            name=request.name,
            description=request.description,
        ),
        machine_id=request.machine_id,
        root=root,
    )

    return GCodeTranslationResult(
        program=program,
        pose_count=len(nodes),
        warnings=warnings,
        dropped_lines=list(parser_dropped or []),
    )


# ── Preview helper ────────────────────────────────────────────────────────────


def make_preview(
    result: GCodeTranslationResult, max_poses: int = _MAX_PREVIEW_POSES
) -> GCodePreview:
    """Extract a lightweight path preview from a translation result."""
    steps = result.program.root.children
    truncated = len(steps) > max_poses
    trimmed = steps[:max_poses]
    positions = [n.attributes.get("position", [0.0, 0.0, 0.0]) for n in trimmed]
    motion_types = [str(n.attributes.get("motion_type", "feed")) for n in trimmed]
    return GCodePreview(
        positions=positions,
        motion_types=motion_types,
        warnings=result.warnings,
        truncated=truncated,
        pose_count=result.pose_count,
    )
