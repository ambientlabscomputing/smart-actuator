"""
Closed-form IK for a spherical wrist (ZYZ or ZYX Euler decomposition).

A spherical wrist has three revolute joints whose axes intersect at a common
point (the wrist centre).  Given the desired end-effector orientation R_ee and
the rotation R_arm already applied by the positioning sub-chain, the wrist
rotation is:

    R_wrist = R_arm^T · R_ee

We decompose R_wrist using ZYZ Euler angles, which match the standard
spherical wrist (yaw–pitch–yaw) joint layout.

If the target orientation is omitted (target has only 3 or fewer elements),
the solver returns the current wrist angles unchanged — the orientation is
treated as unconstrained.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec

_EPS = 1e-9


def solve_spherical_wrist(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],
    ee: EndEffectorSpec | None,
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    """
    Solve orientation for a ZYZ spherical wrist.

    *target* is expected to be [x, y, z, qx, qy, qz, qw] (7 elements).
    The positional part is ignored here — it has already been handled by the
    positioning sub-chain.  If target has fewer than 7 elements, the solver
    returns the current wrist angles (unconstrained orientation).

    *current_q* is the full joint-angle vector for the machine.

    Returns [θ_w0, θ_w1, θ_w2] for the three wrist joints.
    """
    if len(joint_indices) != 3:
        return None

    i0, i1, i2 = joint_indices

    # If no orientation in target, hold current pose
    if len(target) < 7:
        return [
            current_q[i0] if i0 < len(current_q) else 0.0,
            current_q[i1] if i1 < len(current_q) else 0.0,
            current_q[i2] if i2 < len(current_q) else 0.0,
        ]

    qx, qy, qz, qw = target[3], target[4], target[5], target[6]

    # Normalise quaternion
    qnorm = math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw)
    if qnorm < _EPS:
        return None
    qx, qy, qz, qw = qx / qnorm, qy / qnorm, qz / qnorm, qw / qnorm

    # Convert quaternion → rotation matrix (row-major)
    R = _quat_to_rot(qx, qy, qz, qw)

    # ZYZ Euler decomposition of R:
    #   R = Rz(α) · Ry(β) · Rz(γ)
    # β = acos(R[2,2]), α = atan2(R[1,2], R[0,2]), γ = atan2(R[2,1], -R[2,0])
    r22 = max(-1.0, min(1.0, R[2][2]))
    beta = math.acos(r22)

    if abs(math.sin(beta)) < _EPS:
        # Gimbal lock: β = 0 or π — only α+γ is determined
        alpha = 0.0
        gamma = math.atan2(-R[0][1], R[0][0]) if r22 > 0 else math.atan2(R[0][1], -R[0][0])
    else:
        alpha = math.atan2(R[1][2], R[0][2])
        gamma = math.atan2(R[2][1], -R[2][0])

    angles = [alpha, beta, gamma]

    # Enforce joint limits — clamp each angle independently
    for k, idx in enumerate([i0, i1, i2]):
        jv = dh.joints[idx]
        lo = math.radians(jv.limit_lower)
        hi = math.radians(jv.limit_upper)
        angles[k] = max(lo, min(hi, angles[k]))

    return angles


def _quat_to_rot(qx: float, qy: float, qz: float, qw: float) -> list[list[float]]:
    """Return a 3×3 rotation matrix from a unit quaternion."""
    return [
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
        [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
        [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ]
