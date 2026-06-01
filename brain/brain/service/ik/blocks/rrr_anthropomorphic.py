"""
Closed-form IK for a 3-DOF anthropomorphic arm (RRR):
  joint 0 — base yaw (revolute around vertical axis)
  joint 1 — shoulder (revolute, parallel to joint 2)
  joint 2 — elbow    (revolute, parallel to joint 1)

The approach:
  1. Solve θ₀ (base yaw) from the horizontal projection of the target:
         θ₀ = atan2(y_target, x_target)
  2. Compute the reach distance in the arm's sagittal plane:
         r = sqrt(x² + y²)
  3. Solve [θ₁, θ₂] using the planar_2r solver on (r, z).

This is valid when joint 0 rotates around the Z-axis and joints 1, 2 rotate
around their (shared) Y-axis — the standard anthropomorphic configuration.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from brain.service.ik.blocks.planar_2r import solve_planar_2r

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec

_EPS = 1e-9


def solve_rrr_anthropomorphic(
    dh: "DHChainValues",
    joint_indices: list[int],
    target: list[float],
    ee: "EndEffectorSpec | None",
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    if len(joint_indices) != 3:
        return None

    i_yaw, i_shoulder, i_elbow = joint_indices

    x = float(target[0]) if len(target) > 0 else 0.0
    y = float(target[1]) if len(target) > 1 else 0.0
    z = float(target[2]) if len(target) > 2 else 0.0

    # Step 1: base yaw
    t_yaw = math.atan2(y, x)

    # Enforce yaw limits
    jv_yaw = dh.joints[i_yaw]
    lo_yaw = math.radians(jv_yaw.limit_lower)
    hi_yaw = math.radians(jv_yaw.limit_upper)
    if not (lo_yaw <= t_yaw <= hi_yaw):
        # Try the supplementary angle (180° off) to stay in limits
        t_yaw_alt = t_yaw + (math.pi if t_yaw < 0 else -math.pi)
        if lo_yaw <= t_yaw_alt <= hi_yaw:
            t_yaw = t_yaw_alt
        # else: proceed anyway — numeric polish will tighten

    # Step 2: reach in sagittal plane.
    # planar_2r works in joint 0's pre-transform frame: its target is read
    # as (x', y') from the first two components.  For the inner shoulder+
    # elbow chain (with the waist's α=90° twist already applied), the world
    # vertical z maps to the inner-frame y′.  So we pack [r, z, 0].
    r = math.sqrt(x * x + y * y)
    planar_target = [r, z, 0.0]

    inner = solve_planar_2r(
        dh,
        [i_shoulder, i_elbow],
        planar_target,
        None,   # EE offset already folded into the target by the composer
        branch_preference,
        current_q,
    )
    if inner is None:
        return None

    t_shoulder, t_elbow = inner
    return [t_yaw, t_shoulder, t_elbow]
