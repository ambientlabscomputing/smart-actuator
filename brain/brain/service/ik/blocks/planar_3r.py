"""
Closed-form IK stub for a planar 3-DOF revolute arm (3R).

A planar 3R arm has one redundant DOF for position-only tasks (the extra DOF
is used to satisfy both position and orientation in the plane).  Full analytic
solution requires specifying the desired end-effector orientation angle (ψ),
which the composer passes as the z-component of the orientation target.

This implementation solves:
    θ₂ from the wrist-point decoupling: p_wrist = p_ee − L₂·[cos ψ, sin ψ]
    then applies the standard 2R solve on joints 0, 1 for the wrist point,
    with θ₀ adjusted to satisfy ψ = θ₀ + θ₁ + θ₂.

If no orientation is provided in the target (len < 4), defaults to ψ = 0.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from brain.service.ik.blocks.planar_2r import _normalise, solve_planar_2r

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec

_EPS = 1e-9


def solve_planar_3r(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],
    ee: EndEffectorSpec | None,
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    if len(joint_indices) != 3:
        return None

    i0, i1, i2 = joint_indices
    jv2 = dh.joints[i2]
    L2 = abs(jv2.a)

    # Desired end-effector angle in the plane (ψ)
    # target[3] is orientation-in-plane if provided, else 0
    psi = float(target[3]) if len(target) > 3 else 0.0

    # EE position — planar_3r operates in its joint chain's local 2-plane,
    # which is (x, y) of joint 0's pre-transform frame (planar_2r convention).
    x_ee = float(target[0]) if len(target) > 0 else 0.0
    y_ee = float(target[1]) if len(target) > 1 else 0.0

    # Wrist-point decoupling: subtract the last link's contribution
    x_w = x_ee - L2 * math.cos(psi)
    y_w = y_ee - L2 * math.sin(psi)

    # Solve the inner 2R for [i0, i1] targeting the wrist point
    inner_target = [x_w, y_w, 0.0]
    inner = solve_planar_2r(
        dh,
        [i0, i1],
        inner_target,
        None,  # no EE offset for the inner chain
        branch_preference,
        current_q,
    )
    if inner is None:
        return None

    t0, t1 = inner
    t2 = _normalise(psi - t0 - t1)

    # Enforce joint 2 limits if available
    jv2_lo = math.radians(jv2.limit_lower)
    jv2_hi = math.radians(jv2.limit_upper)
    if not (jv2_lo <= _normalise(t2) <= jv2_hi):
        return None  # let composer fall through to numeric

    return [t0, t1, t2]
