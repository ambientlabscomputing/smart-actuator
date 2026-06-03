"""
G-code sample file generator.

All motions are expressed in millimetres (G21) absolute mode (G90).
The working range is roughly 0.1 – 0.3 m from the base, expressed in mm
(100 – 300 mm).  Feed rates are realistic for a slow robot arm (≈ 1000 mm/min).

Public API
----------
generate_sample(name) -> str   — return G-code text for a named sample
SAMPLE_NAMES                   — list of available names
"""

from __future__ import annotations

import math
from typing import Callable

# ── helpers ───────────────────────────────────────────────────────────────────


def _header(title: str) -> list[str]:
    return [
        f"; Sample: {title}",
        "G21 ; mm",
        "G90 ; absolute",
        f"G0 Z200 F3000 ; safe height",
    ]


def _footer() -> list[str]:
    return [
        "G0 Z200 F3000 ; return to safe height",
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


def _square() -> str:
    """
    Square traverse: four corners at Z=150 mm, 200×200 mm centred at (0,0).
    Demonstrates G0 rapid + G1 feed linear moves.
    """
    lines = _header("Square traverse (200×200 mm @ Z=150)")
    corners = [
        (-100, -100),
        ( 100, -100),
        ( 100,  100),
        (-100,  100),
        (-100, -100),  # close
    ]
    z = 150.0
    # Rapid to first corner
    x0, y0 = corners[0]
    lines.append(_rapid(x0, y0, z))
    # Feed around the square
    for x, y in corners[1:]:
        lines.append(_feed(x, y, z, f=1200))
    lines += _footer()
    return "\n".join(lines)


def _circle() -> str:
    """
    Full circle: two G3 semicircles at Z=150 mm, radius 120 mm.
    Demonstrates arc interpolation.
    """
    lines = _header("Full circle (R=120 mm @ Z=150)")
    r = 120.0
    z = 150.0
    # Start at (r, 0)
    lines.append(_rapid(r, 0, z))
    # First semicircle: (r,0) → (-r,0), centre at (0,0) → I=-r, J=0
    lines.append(_arc_ccw(-r, 0, z, -r, 0, f=900))
    # Second semicircle: (-r,0) → (r,0), centre at (0,0) → I=r, J=0
    lines.append(_arc_ccw(r, 0, z, r, 0, f=900))
    lines += _footer()
    return "\n".join(lines)


def _spiral() -> str:
    """
    Archimedean spiral outward (R 100→250 mm) using small G1 chords.
    Demonstrates many sequential feed moves forming a curved path.
    """
    lines = _header("Archimedean spiral R=100→250 mm @ Z=150")
    z = 150.0
    turns = 3
    steps = 72  # 5° per step
    total_steps = turns * steps
    r_start, r_end = 100.0, 250.0
    # Rapid to start
    lines.append(_rapid(r_start, 0, z))
    for i in range(1, total_steps + 1):
        angle = 2 * math.pi * i / steps
        r = r_start + (r_end - r_start) * i / total_steps
        x = r * math.cos(angle)
        y = r * math.sin(angle)
        lines.append(_feed(x, y, z, f=1000))
    lines += _footer()
    return "\n".join(lines)


def _helix() -> str:
    """
    Helical descent: one full G2 arc per layer, descending from Z=250→100 mm
    in 6 passes.  Radius 150 mm.  Demonstrates helical arc (Z changes in G2).
    """
    lines = _header("Helical descent Z=250→100, R=150 mm")
    r = 150.0
    z_start = 250.0
    z_end = 100.0
    passes = 6
    dz = (z_start - z_end) / passes
    # Rapid to (r, 0, z_start)
    lines.append(_rapid(r, 0, z_start))
    for p in range(passes):
        z_top = z_start - p * dz
        z_bot = z_top - dz
        # Two semicircles per pass so each arc ends at a known XY location
        # First half: (r,0) → (-r,0), descend dz/2
        z_mid = z_top - dz / 2
        lines.append(_arc_cw(-r, 0, z_mid, -r, 0, f=600))
        # Second half: (-r,0) → (r,0)
        lines.append(_arc_cw(r, 0, z_bot, r, 0, f=600))
    lines += _footer()
    return "\n".join(lines)


def _figure_eight() -> str:
    """
    Figure-eight: two tangent circles, CCW then CW, at Z=150 mm, R=100 mm.
    Demonstrates reversing arc direction.
    """
    lines = _header("Figure-eight (2×R=100 mm @ Z=150)")
    r = 100.0
    z = 150.0
    # Left circle centred at (-r, 0); right circle centred at (r, 0).
    # Start at (0, 0) — tangent point.
    lines.append(_rapid(0, 0, z))
    # CCW around left circle: start=(0,0) end=(0,0), centre=(-r,0) → I=-r, J=0
    lines.append(_arc_ccw(0, 0, z, -r, 0, f=900))
    # CW around right circle: start=(0,0) end=(0,0), centre=(r,0) → I=r, J=0
    lines.append(_arc_cw(0, 0, z, r, 0, f=900))
    lines += _footer()
    return "\n".join(lines)


def _zigzag() -> str:
    """
    Raster zigzag: 10 rows, X ±150 mm, Y advances 25 mm per row, Z=150 mm.
    Demonstrates pure G1 raster-like motion (e.g. paint / scan coverage).
    """
    lines = _header("Zigzag raster (10 rows, 300 mm wide @ Z=150)")
    z = 150.0
    rows = 10
    x_amp = 150.0
    y_step = 25.0
    y_start = -((rows - 1) * y_step) / 2
    # Rapid to start
    lines.append(_rapid(-x_amp, y_start, z))
    for row in range(rows):
        y = y_start + row * y_step
        x = x_amp if row % 2 == 0 else -x_amp
        lines.append(_feed(x, y, z, f=1500))
    lines += _footer()
    return "\n".join(lines)


def _arc_transitions() -> str:
    """
    Straight segments connected by small quarter-circle fillets.
    Demonstrates interleaving G1 and G2/G3 in a practical path.
    """
    lines = _header("Arc-fillet rectangle (corners R=30 mm @ Z=150)")
    z = 150.0
    hw, hh, r = 120.0, 80.0, 30.0  # half-width, half-height, fillet radius
    # Inner rectangle corners (where the lines end, arcs begin)
    # Travel CCW: bottom-left → bottom-right → top-right → top-left → close
    lines.append(_rapid(-(hw - r), -hh, z))
    # Bottom edge
    lines.append(_feed(hw - r, -hh, z, f=1200))
    # Bottom-right fillet (CCW, centre = (hw-r, -hh+r))
    lines.append(_arc_ccw(hw, -(hh - r), z, 0, r, f=900))
    # Right edge
    lines.append(_feed(hw, hh - r, z, f=1200))
    # Top-right fillet
    lines.append(_arc_ccw(hw - r, hh, z, -r, 0, f=900))
    # Top edge
    lines.append(_feed(-(hw - r), hh, z, f=1200))
    # Top-left fillet
    lines.append(_arc_ccw(-hw, hh - r, z, 0, -r, f=900))
    # Left edge
    lines.append(_feed(-hw, -(hh - r), z, f=1200))
    # Bottom-left fillet (close)
    lines.append(_arc_ccw(-(hw - r), -hh, z, r, 0, f=900))
    lines += _footer()
    return "\n".join(lines)


def _star() -> str:
    """
    Five-pointed star: rapid to each tip then feed to each inner valley.
    Demonstrates alternating rapid-to-point and feed moves.
    """
    lines = _header("Five-pointed star (R_outer=200, R_inner=80 @ Z=150)")
    r_out, r_in = 200.0, 80.0
    z = 150.0
    n = 5
    # Outer tips at even indices, inner valleys at odd indices
    vertices: list[tuple[float, float]] = []
    for k in range(n * 2):
        angle = math.pi / 2 + k * math.pi / n  # start pointing up
        r = r_out if k % 2 == 0 else r_in
        vertices.append((r * math.cos(angle), r * math.sin(angle)))
    # Rapid to first outer tip
    x0, y0 = vertices[0]
    lines.append(_rapid(x0, y0, z))
    for x, y in vertices[1:]:
        lines.append(_feed(x, y, z, f=1200))
    # Close star
    lines.append(_feed(x0, y0, z, f=1200))
    lines += _footer()
    return "\n".join(lines)


# ── registry ───────────────────────────────────────────────────────────────────

_GENERATORS: dict[str, Callable[[], str]] = {
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
    """Return G-code text for *name*.  Raises KeyError for unknown names."""
    try:
        return _GENERATORS[name]()
    except KeyError:
        raise KeyError(f"Unknown sample '{name}'.  Available: {SAMPLE_NAMES}") from None
