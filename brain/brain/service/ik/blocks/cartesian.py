"""
Cartesian XYZ decomposition block for three orthogonal prismatic joints.

Solves trivially:

    q_i = dot(target_xyz - base_origin, axis_i)

where axis_i is the world-frame unit vector along which joint i translates.
For a standard PPP gantry (X → Y → Z, all starting from world origin) this
reduces to a direct component extraction.

Axis orientations are derived from the DH chain at the zero position using
the same FK convention as dh_fk.joint_transforms: the joint translates along
the Z-axis of its *incoming* frame (after the Rz·Tz·Tx·Rx steps).

Returns None if:
  • The solver cannot extract orthogonal axes (collinear or near-parallel) —
    the verifier should have caught this, but the block is defensive.
  • Any required joint travel would exceed its stored limits.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec

_ORTHO_TOL = 0.05  # sin threshold for "not orthogonal" (~3°)
_PARALLEL_TOL = 0.05  # |dot| threshold for "not parallel" to world axis


def solve_cartesian_xyz(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],
    ee: EndEffectorSpec | None,
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    """
    Solve a 3-prismatic Cartesian block.

    ``target`` is [x, y, z] in metres (world frame, at the TCP).
    Returns [q0, q1, q2] in metres (one per joint in joint_indices order),
    or None if the geometry is degenerate.
    """
    if len(joint_indices) != 3:
        return None

    # Subtract EE offset from target so we solve to the last-joint origin.
    tx, ty, tz = (target[0], target[1], target[2]) if len(target) >= 3 else (0.0, 0.0, 0.0)
    if ee is not None:
        tx -= ee.offset_m[0]
        ty -= ee.offset_m[1]
        tz -= ee.offset_m[2]

    from brain.service.dh_fk import joint_transforms

    # Compute zero-pose transforms to extract joint axes.
    zero_q = [0.0] * len(dh.joints)
    transforms = joint_transforms(dh, zero_q)

    # The translation axis for prismatic joint i is the column of the
    # incoming frame (before joint i's transform) corresponding to jv.axis:
    #   axis="x" → X-column, axis="y" → Y-column, axis="z" → Z-column.
    # The incoming frame for joint i is transforms[i-1] (or world identity
    # for joint 0).  transforms[i] is the frame *after* joint i.
    axes: list[tuple[float, float, float]] = []
    base_origins: list[tuple[float, float, float]] = []

    for slot in joint_indices:
        if slot < 0 or slot >= len(dh.joints):
            return None

        jv_slot = dh.joints[slot]
        axis_label = getattr(jv_slot, "axis", "z")

        if slot == 0:
            # Incoming frame is world identity.
            if axis_label == "x":
                axis = (1.0, 0.0, 0.0)
            elif axis_label == "y":
                axis = (0.0, 1.0, 0.0)
            else:
                axis = (0.0, 0.0, 1.0)
            origin = (0.0, 0.0, 0.0)
        else:
            prev_T = transforms[slot - 1]
            if axis_label == "x":
                axis = (prev_T[0], prev_T[4], prev_T[8])  # X column
            elif axis_label == "y":
                axis = (prev_T[1], prev_T[5], prev_T[9])  # Y column
            else:
                axis = (prev_T[2], prev_T[6], prev_T[10])  # Z column
            origin = (prev_T[3], prev_T[7], prev_T[11])

        axes.append(axis)
        base_origins.append(origin)

    # Verify mutual orthogonality of the three axes.
    for ia in range(3):
        for ib in range(ia + 1, 3):
            dot = sum(axes[ia][k] * axes[ib][k] for k in range(3))
            if abs(dot) > _ORTHO_TOL:
                return None  # axes not orthogonal — fall through to numeric

    # Solve: project (target - base_origin_i) onto axis_i for each joint.
    q_result: list[float] = []
    for i, slot in enumerate(joint_indices):
        jv = dh.joints[slot]
        ox, oy, oz = base_origins[i]
        ax, ay, az = axes[i]
        # q_i = dot(target - base_origin, axis)
        q_i = (tx - ox) * ax + (ty - oy) * ay + (tz - oz) * az
        # Clamp to joint limits (in metres for prismatic).
        q_i = max(jv.limit_lower, min(jv.limit_upper, q_i))
        q_result.append(q_i)

    return q_result
