"""
Pure DH forward-kinematics helpers.

Mirrors the chain math inlined in ArmCanvas.tsx so that backend services
(WorkspaceService, KinematicsService, …) can compute end-effector positions
without touching the URDF or launching a MuJoCo sim.

Convention (same as ArmCanvas.tsx and dh_urdf.py):
  • Links extend along local +X (length = a).
  • d translates along local +Z (joint offset along the rotation axis).
  • Joints rotate about local +Z.
  • The transform for joint i is:
        T_i = T_{i-1} · Rz(θ_offset + θ_i) · Tz(d) · Tx(a) · Rx(α)
    where a and d are in metres, α and θ_offset are stored in degrees
    (converted to radians here), and θ_i is the commanded angle in radians.

All functions are stateless and allocation-light (plain lists, no numpy
required) so they compose easily into tight sampling loops.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec


# ── 4×4 homogeneous matrix as a flat 16-element list (row-major) ──────────────
# Index convention:  m[row*4 + col]

def _identity() -> list[float]:
    return [1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1]


def _mat_mul(a: list[float], b: list[float]) -> list[float]:
    """Multiply two 4×4 matrices (row-major flat lists)."""
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            s = 0.0
            for k in range(4):
                s += a[r * 4 + k] * b[k * 4 + c]
            out[r * 4 + c] = s
    return out


def _rz(angle_rad: float) -> list[float]:
    """Rotation about Z."""
    c, s = math.cos(angle_rad), math.sin(angle_rad)
    return [c, -s, 0, 0,
            s,  c, 0, 0,
            0,  0, 1, 0,
            0,  0, 0, 1]


def _rx(angle_rad: float) -> list[float]:
    """Rotation about X."""
    c, s = math.cos(angle_rad), math.sin(angle_rad)
    return [1, 0,  0, 0,
            0, c, -s, 0,
            0, s,  c, 0,
            0, 0,  0, 1]


def _tz(dist: float) -> list[float]:
    """Translation along Z."""
    return [1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, dist,
            0, 0, 0, 1]


def _tx(dist: float) -> list[float]:
    """Translation along X."""
    return [1, 0, 0, dist,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1]


# ── Public API ────────────────────────────────────────────────────────────────

def joint_transforms(values: "DHChainValues", angles_rad: list[float]) -> list[list[float]]:
    """
    Compute the world-frame transform for each joint origin (not the EE).

    Returns a list of N 4×4 matrices (row-major flat), one per joint.
    ``angles_rad[i]`` is the commanded angle for joint i; if shorter than the
    number of joints, the remaining joints are treated as zero.
    """
    transforms: list[list[float]] = []
    T = _identity()
    for i, jv in enumerate(values.joints):
        theta_i = angles_rad[i] if i < len(angles_rad) else 0.0
        theta_total = math.radians(jv.theta_offset) + theta_i
        alpha_rad = math.radians(jv.alpha)

        # Standard DH chain matching the +X-link convention used by ArmCanvas:
        #   Rz(θ) · Tz(d) · Tx(a) · Rx(α)
        T = _mat_mul(T, _rz(theta_total))
        T = _mat_mul(T, _tz(jv.d))
        T = _mat_mul(T, _tx(jv.a))
        T = _mat_mul(T, _rx(alpha_rad))
        transforms.append(list(T))
    return transforms


def ee_position(values: "DHChainValues", angles_rad: list[float]) -> tuple[float, float, float]:
    """
    Return the (x, y, z) world position of the end-effector.

    The EE is at the origin of the frame *after* the last joint's full
    transform (no additional link extension — the link is already incorporated
    as the Tz(a) step inside the chain).
    """
    transforms = joint_transforms(values, angles_rad)
    if not transforms:
        return (0.0, 0.0, 0.0)
    T = transforms[-1]
    return (T[3], T[7], T[11])  # row-major: (0,3), (1,3), (2,3)


def reach_extent(values: "DHChainValues") -> tuple[float, float]:
    """
    Analytic approximate reach bounds for a serial revolute chain
    (ignores inter-joint coupling but useful for fast pre-checks).

    Returns ``(reach_min, reach_max)`` in metres.

    reach_max ≈ sum of all link lengths (|a|) + |d| contributions.
    reach_min ≈ max(0, max_link - sum_of_rest).
    """
    lengths = [abs(jv.a) + abs(jv.d) for jv in values.joints]
    total = sum(lengths)
    if not lengths:
        return (0.0, 0.0)
    max_link = max(lengths)
    rest = total - max_link
    return (max(0.0, max_link - rest), total)


# ── End-effector helpers ──────────────────────────────────────────────────────

def _ee_offset_matrix(ee: "EndEffectorSpec") -> list[float]:
    """
    Build the 4×4 homogeneous matrix for the EE offset from the parent joint
    frame.  Applies translation (offset_m) then intrinsic RPY rotation
    (orientation_offset_deg) in the order Rx(r)·Ry(p)·Rz(y).
    """
    tx = ee.offset_m[0] if len(ee.offset_m) > 0 else 0.0
    ty = ee.offset_m[1] if len(ee.offset_m) > 1 else 0.0
    tz = ee.offset_m[2] if len(ee.offset_m) > 2 else 0.0
    roll_r  = math.radians(ee.orientation_offset_deg[0] if ee.orientation_offset_deg else 0.0)
    pitch_r = math.radians(ee.orientation_offset_deg[1] if len(ee.orientation_offset_deg) > 1 else 0.0)
    yaw_r   = math.radians(ee.orientation_offset_deg[2] if len(ee.orientation_offset_deg) > 2 else 0.0)

    cr, sr = math.cos(roll_r),  math.sin(roll_r)
    cp, sp = math.cos(pitch_r), math.sin(pitch_r)
    cy, sy = math.cos(yaw_r),   math.sin(yaw_r)

    # Combined translation + intrinsic RPY rotation (Rz·Ry·Rx order):
    return [
        cy*cp,              cy*sp*sr - sy*cr,   cy*sp*cr + sy*sr,   tx,
        sy*cp,              sy*sp*sr + cy*cr,   sy*sp*cr - cy*sr,   ty,
        -sp,                cp*sr,              cp*cr,              tz,
        0.0,                0.0,                0.0,                1.0,
    ]


def ee_transform(
    values: "DHChainValues",
    angles_rad: list[float],
    ee: "EndEffectorSpec | None" = None,
) -> list[float]:
    """
    Compute the 4×4 world-frame homogeneous transform of the end-effector.

    If *ee* is None the EE is taken as the last joint origin (no offset) —
    backward-compatible with the old ``ee_position`` behaviour.

    Returns a flat 16-element row-major matrix.
    """
    transforms = joint_transforms(values, angles_rad)
    if not transforms:
        return _identity()
    T_last = transforms[-1]
    if ee is None:
        return T_last
    return _mat_mul(T_last, _ee_offset_matrix(ee))


def ee_position_with_spec(
    values: "DHChainValues",
    angles_rad: list[float],
    ee: "EndEffectorSpec | None" = None,
) -> tuple[float, float, float]:
    """Return the (x, y, z) world position of the EE, honouring the EE offset."""
    T = ee_transform(values, angles_rad, ee)
    return (T[3], T[7], T[11])


# ── Analytic Jacobian ─────────────────────────────────────────────────────────

def geometric_jacobian(
    values: "DHChainValues",
    angles_rad: list[float],
    ee: "EndEffectorSpec | None" = None,
) -> list[list[float]]:
    """
    Compute the 6×n geometric Jacobian for the chain at the given joint angles.

    Returns a list of 6 rows, each with n entries (column-per-joint).
    Top 3 rows: linear velocity Jacobian (J_v).
    Bottom 3 rows: angular velocity Jacobian (J_w).

    For revolute joint i:
        J_v_i = z_{i-1} × (p_ee − p_{i-1})
        J_w_i = z_{i-1}
    For prismatic joint i:
        J_v_i = z_{i-1}
        J_w_i = 0
    """
    n = len(values.joints)
    transforms = joint_transforms(values, angles_rad)

    T_ee = ee_transform(values, angles_rad, ee)
    p_ee = [T_ee[3], T_ee[7], T_ee[11]]

    # Frame −1 is the world frame
    frames: list[tuple[list[float], list[float]]] = [
        ([0.0, 0.0, 1.0], [0.0, 0.0, 0.0])
    ]
    for T in transforms:
        z = [T[2], T[6], T[10]]   # third column of rotation (row-major)
        p = [T[3], T[7], T[11]]
        frames.append((z, p))

    J: list[list[float]] = [[0.0] * n for _ in range(6)]
    for i, jv in enumerate(values.joints):
        z_prev, p_prev = frames[i]
        if getattr(jv, "type", "revolute") != "prismatic":
            dp = [p_ee[k] - p_prev[k] for k in range(3)]
            jv_col = _cross(z_prev, dp)
            jw_col = z_prev
        else:
            jv_col = z_prev
            jw_col = [0.0, 0.0, 0.0]
        for r in range(3):
            J[r][i]     = jv_col[r]
            J[r + 3][i] = jw_col[r]

    return J


def _cross(a: list[float], b: list[float]) -> list[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
