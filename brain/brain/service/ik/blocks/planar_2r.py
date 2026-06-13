"""
Closed-form IK for a planar 2-DOF revolute arm (2R).

Solves for joint angles [θ₀, θ₁] given a 2-D target (x, y) in the plane of
the arm.  Uses the standard geometric solution:

    cos(θ₁) = (r² − L₀² − L₁²) / (2·L₀·L₁)
    θ₁ = ±acos(c₁)                   (two branches)
    θ₀ = atan2(y, x) − atan2(L₁·s₁, L₀ + L₁·c₁)

where L₀, L₁ are the link lengths (DH `a` parameters), r = sqrt(x² + y²).

Convention: both joints rotate about their local +Z axis (the standard DH
revolute convention used throughout this codebase).  In the world frame
this means the arm sweeps in the XY plane (horizontal under our Z-up
world), which is the planar 2R configuration.

branch_preference controls which branch is returned:
    "elbow_up"   — θ₁ > 0
    "elbow_down" — θ₁ < 0
    "nearest"    — the branch whose θ₁ is closest to current_q[1]
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec

_EPS = 1e-9


def solve_planar_2r(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],
    ee: EndEffectorSpec | None,
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    """
    Closed-form IK for a 2-DOF planar revolute arm.

    *target* must contain at least [x, y, z]; the solver uses (x, y) under
    our Z-up world convention (both joint axes point along world +Z, so
    the arm sweeps in the horizontal XY plane).

    Returns [θ₀, θ₁] in radians for the two joints, or None if the target
    is unreachable.
    """
    if len(joint_indices) != 2:
        return None

    i0, i1 = joint_indices

    # Link lengths from DH 'a' parameter (in metres)
    jv0 = dh.joints[i0]
    jv1 = dh.joints[i1]
    L0 = abs(jv0.a)
    L1 = abs(jv1.a)

    if L0 < _EPS or L1 < _EPS:
        return None  # degenerate geometry

    # Extract (x, y) from target — planar_xy convention (Z-up world).
    x = float(target[0]) if len(target) > 0 else 0.0
    y = float(target[1]) if len(target) > 1 else 0.0

    # Apply EE offset in the plane if present
    if ee is not None and len(ee.offset_m) >= 3:
        x -= ee.offset_m[0]
        y -= ee.offset_m[1]

    r_sq = x * x + y * y
    r = math.sqrt(r_sq)

    # Cosine rule for θ₁
    cos_t1 = (r_sq - L0 * L0 - L1 * L1) / (2.0 * L0 * L1)
    cos_t1 = max(-1.0, min(1.0, cos_t1))  # clamp numerical noise

    sin_t1_pos = math.sqrt(max(0.0, 1.0 - cos_t1 * cos_t1))

    # Two candidate solutions
    t1_up = math.atan2(sin_t1_pos, cos_t1)
    t1_down = math.atan2(-sin_t1_pos, cos_t1)

    def _solve_t0(t1: float) -> float:
        s1 = math.sin(t1)
        c1 = math.cos(t1)
        return math.atan2(y, x) - math.atan2(L1 * s1, L0 + L1 * c1)

    # Apply joint limits if present
    lo0 = math.radians(jv0.limit_lower)
    hi0 = math.radians(jv0.limit_upper)
    lo1 = math.radians(jv1.limit_lower)
    hi1 = math.radians(jv1.limit_upper)

    def _in_limits(t0: float, t1: float) -> bool:
        t0n = _normalise(t0)
        t1n = _normalise(t1)
        return (lo0 <= t0n <= hi0) and (lo1 <= t1n <= hi1)

    # Select branch
    q1_current = current_q[i1] if i1 < len(current_q) else 0.0

    candidates: list[tuple[float, float]] = []
    for t1 in (t1_up, t1_down):
        t0 = _solve_t0(t1)
        if _in_limits(t0, t1):
            candidates.append((t0, t1))

    if not candidates:
        # Relax limits — return best-effort (nearest to current) so the
        # numeric polish step can refine further
        candidates = [(_solve_t0(t1_up), t1_up), (_solve_t0(t1_down), t1_down)]

    if branch_preference == "elbow_up":
        candidates.sort(key=lambda c: -c[1])  # prefer positive θ₁
    elif branch_preference == "elbow_down":
        candidates.sort(key=lambda c: c[1])  # prefer negative θ₁
    else:  # nearest
        candidates.sort(key=lambda c: abs(c[1] - q1_current))

    t0_chosen, t1_chosen = candidates[0]

    # Build full output (slot order: i0, i1)
    result = [0.0] * (max(i0, i1) + 1)
    result[i0] = t0_chosen
    result[i1] = t1_chosen
    return [result[i0], result[i1]]


def _normalise(angle: float) -> float:
    """Wrap angle to [-π, π]."""
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle
