"""
G-code sample file generator.

All motions are expressed in millimetres (G21) absolute mode (G90).

Public API
----------
generate_sample(name) -> str
    Return G-code text for a named sample using the built-in geometry
    (centred at X=0 Y=0 — suitable for arm robots, NOT CNC gantries).

generate_gantry_sample(name, *, origin_mm, width_mm, height_mm) -> str
    Return G-code fitted to a gantry envelope with all-positive coordinates.
    origin_mm = (cx, cy, work_z) — pattern centre and working Z, all in mm.
    width_mm / height_mm — overall bounding-box of the pattern in the XY plane.

SAMPLE_NAMES                   — sorted list of available names
"""

from __future__ import annotations

import math
from typing import Callable

# ── helpers ───────────────────────────────────────────────────────────────────


def _header(title: str, safe_z: float = 200.0) -> list[str]:
    return [
        f"; Sample: {title}",
        "G21 ; mm",
        "G90 ; absolute",
        f"G0 Z{safe_z:.3f} F3000 ; safe height",
    ]


def _footer(safe_z: float = 200.0) -> list[str]:
    return [
        f"G0 Z{safe_z:.3f} F3000 ; return to safe height",
        "; end of program",
    ]


def _rapid(x: float, y: float, z: float) -> str:
    return f"G0 X{x:.3f} Y{y:.3f} Z{z:.3f}"


def _feed(x: float, y: float, z: float, f: float = 1000) -> str:
    return f"G1 X{x:.3f} Y{y:.3f} Z{z:.3f} F{f:.0f}"


def _arc_cw(x: float, y: float, z: float, i: float, j: float, f: float = 800) -> str:
    return f"G2 X{x:.3f} Y{y:.3f} Z{z:.3f} I{i:.3f} J{j:.3f} F{f:.0f}"


def _arc_ccw(x: float, y: float, z: float, i: float, j: float, f: float = 800) -> str:
    return f"G3 X{x:.3f} Y{y:.3f} Z{z:.3f} I{i:.3f} J{j:.3f} F{f:.0f}"


# ── sample generators ──────────────────────────────────────────────────────────
#
# Each generator accepts optional (cx, cy, work_z, w, h) kwargs:
#   cx, cy    — centre of the pattern in XY (mm), default 0 for arm robots
#   work_z    — Z level for work moves (mm)
#   w, h      — overall bounding box width × height (mm)
# Backward-compatible defaults match the original hardcoded geometry.


def _square(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 200.0, h: float = 200.0,
) -> str:
    """Square traverse: four corners at work_z, w×h centred at (cx, cy)."""
    hw, hh = w / 2, h / 2
    safe_z = work_z + max(10.0, min(w, h) * 0.15)
    lines = _header(f"Square traverse ({w:.0f}\u00d7{h:.0f} mm @ Z={work_z:.0f})", safe_z)
    corners = [
        (cx - hw, cy - hh),
        (cx + hw, cy - hh),
        (cx + hw, cy + hh),
        (cx - hw, cy + hh),
        (cx - hw, cy - hh),  # close
    ]
    x0, y0 = corners[0]
    lines.append(_rapid(x0, y0, work_z))
    for x, y in corners[1:]:
        lines.append(_feed(x, y, work_z, f=1200))
    lines += _footer(safe_z)
    return "\n".join(lines)


def _circle(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 240.0, h: float = 240.0,
) -> str:
    """Full circle: two G3 semicircles at work_z, radius = min(w,h)/2."""
    r = min(w, h) / 2
    safe_z = work_z + max(10.0, r * 0.15)
    lines = _header(f"Full circle (R={r:.0f} mm @ Z={work_z:.0f})", safe_z)
    # Start at (cx+r, cy)
    lines.append(_rapid(cx + r, cy, work_z))
    # First semicircle: (cx+r,cy) → (cx-r,cy), I=-r
    lines.append(_arc_ccw(cx - r, cy, work_z, -r, 0, f=900))
    # Second semicircle: (cx-r,cy) → (cx+r,cy), I=+r
    lines.append(_arc_ccw(cx + r, cy, work_z, r, 0, f=900))
    lines += _footer(safe_z)
    return "\n".join(lines)


def _spiral(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 500.0, h: float = 500.0,
) -> str:
    """Archimedean spiral outward using small G1 chords."""
    half = min(w, h) / 2
    r_start = half * 0.2
    r_end   = half * 0.9
    safe_z = work_z + max(10.0, half * 0.1)
    lines = _header(f"Archimedean spiral R={r_start:.0f}\u2192{r_end:.0f} mm @ Z={work_z:.0f}", safe_z)
    turns = 3
    steps = 72  # 5° per step
    total_steps = turns * steps
    lines.append(_rapid(cx + r_start, cy, work_z))
    for i in range(1, total_steps + 1):
        angle = 2 * math.pi * i / steps
        r = r_start + (r_end - r_start) * i / total_steps
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        lines.append(_feed(x, y, work_z, f=1000))
    lines += _footer(safe_z)
    return "\n".join(lines)


def _helix(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 300.0, h: float = 300.0,
) -> str:
    """Helical descent: G2 arcs descending from (work_z + descent) to work_z."""
    r = min(w, h) / 2 * 0.75
    descent = min(h * 0.5, 150.0)
    z_start = work_z + descent
    safe_z  = z_start + max(10.0, descent * 0.2)
    passes  = 6
    dz = descent / passes
    lines = _header(f"Helical descent Z={z_start:.0f}\u2192{work_z:.0f}, R={r:.0f} mm", safe_z)
    lines.append(_rapid(cx + r, cy, z_start))
    for p in range(passes):
        z_top = z_start - p * dz
        z_bot = z_top - dz
        z_mid = z_top - dz / 2
        lines.append(_arc_cw(cx - r, cy, z_mid, -r, 0, f=600))
        lines.append(_arc_cw(cx + r, cy, z_bot, r, 0, f=600))
    lines += _footer(safe_z)
    return "\n".join(lines)


def _figure_eight(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 400.0, h: float = 200.0,
) -> str:
    """Figure-eight: two tangent circles, CCW then CW."""
    r = min(w / 2, h / 2)
    safe_z = work_z + max(10.0, r * 0.15)
    lines = _header(f"Figure-eight (2\u00d7R={r:.0f} mm @ Z={work_z:.0f})", safe_z)
    # Tangent point is at (cx, cy); left centre (cx-r, cy); right centre (cx+r, cy).
    lines.append(_rapid(cx, cy, work_z))
    lines.append(_arc_ccw(cx, cy, work_z, -r, 0, f=900))
    lines.append(_arc_cw(cx, cy, work_z, r, 0, f=900))
    lines += _footer(safe_z)
    return "\n".join(lines)


def _zigzag(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 300.0, h: float = 225.0,
) -> str:
    """Raster zigzag: 10 rows across the w×h bounding box."""
    rows = 10
    x_amp  = w / 2
    y_step = h / max(rows - 1, 1)
    y_start = cy - h / 2
    safe_z = work_z + max(10.0, min(w, h) * 0.1)
    lines = _header(f"Zigzag raster ({rows} rows, {w:.0f} mm wide @ Z={work_z:.0f})", safe_z)
    lines.append(_rapid(cx - x_amp, y_start, work_z))
    for row in range(rows):
        y = y_start + row * y_step
        x = cx + x_amp if row % 2 == 0 else cx - x_amp
        lines.append(_feed(x, y, work_z, f=1500))
    lines += _footer(safe_z)
    return "\n".join(lines)


def _arc_transitions(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 240.0, h: float = 160.0,
) -> str:
    """Rectangle with quarter-circle fillets at each corner."""
    r = min(w, h) * 0.15          # fillet radius ≈ 15% of shorter side
    hw = w / 2 - r
    hh = h / 2 - r
    safe_z = work_z + max(10.0, min(w, h) * 0.12)
    lines = _header(f"Arc-fillet rectangle (corners R={r:.0f} mm @ Z={work_z:.0f})", safe_z)
    lines.append(_rapid(cx - hw, cy - hh - r, work_z))
    # Bottom edge
    lines.append(_feed(cx + hw, cy - hh - r, work_z, f=1200))
    # Bottom-right fillet (CCW, centre = (cx+hw, cy-hh))
    lines.append(_arc_ccw(cx + hw + r, cy - hh, work_z, 0, r, f=900))
    # Right edge
    lines.append(_feed(cx + hw + r, cy + hh, work_z, f=1200))
    # Top-right fillet
    lines.append(_arc_ccw(cx + hw, cy + hh + r, work_z, -r, 0, f=900))
    # Top edge
    lines.append(_feed(cx - hw, cy + hh + r, work_z, f=1200))
    # Top-left fillet
    lines.append(_arc_ccw(cx - hw - r, cy + hh, work_z, 0, -r, f=900))
    # Left edge
    lines.append(_feed(cx - hw - r, cy - hh, work_z, f=1200))
    # Bottom-left fillet (close)
    lines.append(_arc_ccw(cx - hw, cy - hh - r, work_z, r, 0, f=900))
    lines += _footer(safe_z)
    return "\n".join(lines)


def _star(
    cx: float = 0.0, cy: float = 0.0,
    work_z: float = 150.0, w: float = 400.0, h: float = 400.0,
) -> str:
    """Five-pointed star: rapid to each outer tip, feed to each inner valley."""
    r_out = min(w, h) / 2
    r_in  = r_out * 0.4
    safe_z = work_z + max(10.0, r_out * 0.12)
    n = 5
    lines = _header(f"Five-pointed star (R_outer={r_out:.0f}, R_inner={r_in:.0f} @ Z={work_z:.0f})", safe_z)
    vertices: list[tuple[float, float]] = []
    for k in range(n * 2):
        angle = math.pi / 2 + k * math.pi / n
        r = r_out if k % 2 == 0 else r_in
        vertices.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    x0, y0 = vertices[0]
    lines.append(_rapid(x0, y0, work_z))
    for x, y in vertices[1:]:
        lines.append(_feed(x, y, work_z, f=1200))
    lines.append(_feed(x0, y0, work_z, f=1200))
    lines += _footer(safe_z)
    return "\n".join(lines)


# ── registry ───────────────────────────────────────────────────────────────────

# Generators are called as fn(cx, cy, work_z, w, h).
_GENERATORS: dict[str, Callable[..., str]] = {
    "square":          _square,
    "circle":          _circle,
    "spiral":          _spiral,
    "helix":           _helix,
    "figure_eight":    _figure_eight,
    "zigzag":          _zigzag,
    "arc_transitions": _arc_transitions,
    "star":            _star,
}

SAMPLE_NAMES: list[str] = sorted(_GENERATORS)


def generate_sample(name: str) -> str:
    """Return G-code text for *name* using built-in geometry (centred at 0,0).

    Raises KeyError for unknown names.
    """
    try:
        return _GENERATORS[name]()
    except KeyError:
        raise KeyError(f"Unknown sample '{name}'.  Available: {SAMPLE_NAMES}") from None


def generate_gantry_sample(
    name: str,
    *,
    origin_mm: tuple[float, float, float] = (150.0, 150.0, 150.0),
    width_mm: float = 200.0,
    height_mm: float = 200.0,
) -> str:
    """Return G-code fitted to a gantry envelope with all-positive coordinates.

    Parameters
    ----------
    name:
        One of ``SAMPLE_NAMES``.
    origin_mm:
        ``(cx, cy, work_z)`` — the pattern centre (XY) and working Z, in mm.
        Set ``cx = width_mm / 2`` and ``cy = height_mm / 2`` to keep the
        entire pattern in the positive quadrant.
    width_mm:
        Overall bounding-box width along X (mm).
    height_mm:
        Overall bounding-box height along Y (mm).
    """
    fn = _GENERATORS.get(name)
    if fn is None:
        raise KeyError(f"Unknown sample '{name}'.  Available: {SAMPLE_NAMES}")
    cx, cy, work_z = origin_mm
    return fn(cx=cx, cy=cy, work_z=work_z, w=width_mm, h=height_mm)
