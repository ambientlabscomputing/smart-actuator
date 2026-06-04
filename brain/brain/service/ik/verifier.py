"""
Build-time geometric verifier for IK decompositions.

Checks that each block in the decomposition satisfies the geometric
preconditions required by its analytic solver, using the machine's actual
DH chain values.  Returns a structured IKVerification report.

Verification is intentionally lenient: failures and warnings never prevent a
machine from being built — they simply switch the runtime dispatcher to the
numeric fallback and annotate the report so the UI can show a badge.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import (
        DHChainValues,
        IKSpec,
        IKVerification,
        IKBlockVerification,
    )

_AXIS_INTERSECT_TOL_M = 5e-3  # 5 mm — wrist axes must intersect within this


def verify(dh: "DHChainValues", ik_spec: "IKSpec") -> "IKVerification":
    """
    Verify the IK decomposition against the actual DH chain.

    Returns an IKVerification with per-block statuses and an overall
    strategy recommendation ("analytic" or "numeric").
    """
    # Import here to avoid circular imports at module load
    from brain.models.machine import IKVerification, IKBlockVerification

    blocks = ik_spec.decomposition
    if not blocks:
        return IKVerification(
            strategy="numeric",
            blocks=[],
            summary="No decomposition — numeric solver will be used.",
            verified_at=_now(),
        )

    all_joint_indices: list[int] = []
    block_reports: list[IKBlockVerification] = []
    strategy = "analytic"

    for i, block in enumerate(blocks):
        status, reason = _verify_block(dh, block.kind, block.joints)
        if status == "error":
            strategy = "numeric"

        # Check joint index partition (no gaps, no overlaps, in range)
        partition_ok, partition_msg = _check_partition(
            block.joints, len(dh.joints), all_joint_indices
        )
        if not partition_ok:
            status = "error"
            reason = partition_msg
            strategy = "numeric"

        all_joint_indices.extend(block.joints)
        block_reports.append(
            IKBlockVerification(
                block_index=i,
                kind=block.kind,
                joints=block.joints,
                status=status,
                reason=reason,
            )
        )

    # Check all joints are covered
    covered = sorted(all_joint_indices)
    expected = list(range(len(dh.joints)))
    if covered != expected:
        block_reports.append(
            IKBlockVerification(
                block_index=len(blocks),
                kind="__partition__",
                joints=[],
                status="error",
                reason=(
                    f"Decomposition covers joints {covered} but chain has {expected}. "
                    "Joints must be partitioned completely without gaps."
                ),
            )
        )
        strategy = "numeric"

    n_errors   = sum(1 for b in block_reports if b.status == "error")
    n_warnings = sum(1 for b in block_reports if b.status == "warning")
    if n_errors:
        summary = (
            f"{n_errors} block(s) failed geometric verification — "
            "falling back to numeric IK."
        )
    elif n_warnings:
        summary = (
            f"{n_warnings} block(s) passed with warnings — "
            "analytic IK will be attempted."
        )
    else:
        summary = "All blocks verified — analytic IK available."

    return IKVerification(
        strategy=strategy,
        blocks=block_reports,
        summary=summary,
        verified_at=_now(),
    )


# ── Per-block geometric checks ────────────────────────────────────────────────

def _verify_block(
    dh: "DHChainValues",
    kind: str,
    joints: list[int],
) -> tuple[str, str]:
    """
    Return (status, reason) for one block.
    status: "ok" | "warning" | "error"
    """
    if any(j >= len(dh.joints) or j < 0 for j in joints):
        return "error", f"Joint index out of range for chain of length {len(dh.joints)}."

    if kind in ("revolute", "prismatic"):
        if len(joints) != 1:
            return "error", f"'{kind}' block must have exactly 1 joint; got {len(joints)}."
        return "ok", ""

    if kind == "cartesian_xyz":
        if len(joints) != 3:
            return "error", f"cartesian_xyz requires exactly 3 joints; got {len(joints)}."
        ok, msg = _check_prismatic_orthogonal(dh, joints)
        status = "ok" if ok else "warning"
        return status, msg

    if kind == "planar_2r":
        if len(joints) != 2:
            return "error", f"planar_2r requires exactly 2 joints; got {len(joints)}."
        ok, msg = _check_parallel_axes(dh, joints[0], joints[1])
        status = "ok" if ok else "warning"
        return status, msg

    if kind == "planar_3r":
        if len(joints) != 3:
            return "error", f"planar_3r requires exactly 3 joints; got {len(joints)}."
        ok0, _ = _check_parallel_axes(dh, joints[0], joints[1])
        ok1, _ = _check_parallel_axes(dh, joints[1], joints[2])
        if ok0 and ok1:
            return "ok", ""
        return "warning", "Not all three axes are parallel — planar_3r may not solve correctly."

    if kind == "rrr_anthropomorphic":
        if len(joints) != 3:
            return "error", f"rrr_anthropomorphic requires exactly 3 joints; got {len(joints)}."
        ok, msg = _check_parallel_axes(dh, joints[1], joints[2])
        status = "ok" if ok else "warning"
        note = " (shoulder and elbow axes should be parallel)" if not ok else ""
        return status, msg + note

    if kind == "spherical_wrist":
        if len(joints) != 3:
            return "error", f"spherical_wrist requires exactly 3 joints; got {len(joints)}."
        ok, msg = _check_wrist_intersection(dh, joints)
        status = "ok" if ok else "warning"
        return status, msg

    if kind == "numeric":
        return "ok", "Explicit numeric block — no geometric preconditions."

    return "error", f"Unknown block kind {kind!r}."


def _check_parallel_axes(
    dh: "DHChainValues",
    i: int,
    j: int,
) -> tuple[bool, str]:
    """
    Check whether joints i and j rotate about parallel axes.
    For our DH convention all joints rotate about their local Z-axis,
    so axes are parallel when the accumulated alpha angles bring them
    to the same world orientation.  For simplicity we check that both
    alpha values (from the template) are equal modulo 180°.
    """
    ai = math.radians(dh.joints[i].alpha)
    aj = math.radians(dh.joints[j].alpha)
    diff = abs((ai - aj + math.pi) % (2 * math.pi) - math.pi)
    if diff < 0.05:  # ~3°
        return True, ""
    return False, (
        f"Joints {i} and {j} alpha values differ by {math.degrees(diff):.1f}° — "
        "axes may not be parallel."
    )


def _check_wrist_intersection(
    dh: "DHChainValues",
    joints: list[int],
) -> tuple[bool, str]:
    """
    Approximate check that the three wrist joint axes intersect at a common
    point.  For a classic ZYZ wrist the d parameters of joints 1 and 2 in
    the block must be 0 (no offset along the rotation axis).
    """
    # We check that d values for the middle and last wrist joints are small
    i1 = joints[1]
    i2 = joints[2]
    d1 = abs(dh.joints[i1].d)
    d2 = abs(dh.joints[i2].d)
    if d1 < _AXIS_INTERSECT_TOL_M and d2 < _AXIS_INTERSECT_TOL_M:
        return True, ""
    return False, (
        f"Wrist joints {i1} and {i2} have d offsets ({d1*1e3:.1f} mm, {d2*1e3:.1f} mm) "
        f"exceeding intersection tolerance ({_AXIS_INTERSECT_TOL_M*1e3:.0f} mm). "
        "Axes may not intersect — spherical wrist solution may be inaccurate."
    )


def _check_partition(
    joints: list[int],
    n_total: int,
    already_used: list[int],
) -> tuple[bool, str]:
    for j in joints:
        if j < 0 or j >= n_total:
            return False, f"Joint index {j} is out of range [0, {n_total - 1}]."
        if j in already_used:
            return False, f"Joint {j} appears in more than one block."
    return True, ""


def _check_prismatic_orthogonal(
    dh: "DHChainValues",
    joints: list[int],
) -> tuple[bool, str]:
    """
    Check that three prismatic joints have mutually orthogonal translation axes.

    Each prismatic joint translates along the Z-axis of its incoming DH frame.
    At the zero configuration the incoming frame for joint i is the product of
    all preceding DH transforms.  We compute the Z columns of those frames and
    verify that each pair is orthogonal (|dot| < threshold).
    """
    from brain.service.dh_fk import joint_transforms  # local import avoids cycle

    _ORTHO_TOL = 0.05  # ~3° in sin-space

    # Check all joints are prismatic.
    for j in joints:
        jv = dh.joints[j]
        jt = getattr(jv, "type", "revolute")
        if jt != "prismatic":
            return False, (
                f"Joint {j} ({jv.name!r}) is type {jt!r}; "
                "cartesian_xyz requires all three joints to be prismatic."
            )

    zero_q = [0.0] * len(dh.joints)
    transforms = joint_transforms(dh, zero_q)

    # Extract translation axis (X, Y, or Z column of incoming frame) per joint.
    axes: list[tuple[float, float, float]] = []
    for slot in joints:
        jv = dh.joints[slot]
        axis_label = getattr(jv, "axis", "z")
        if slot == 0:
            if axis_label == "x":
                axes.append((1.0, 0.0, 0.0))
            elif axis_label == "y":
                axes.append((0.0, 1.0, 0.0))
            else:
                axes.append((0.0, 0.0, 1.0))
        else:
            prev_T = transforms[slot - 1]
            if axis_label == "x":
                axes.append((prev_T[0], prev_T[4], prev_T[8]))
            elif axis_label == "y":
                axes.append((prev_T[1], prev_T[5], prev_T[9]))
            else:
                axes.append((prev_T[2], prev_T[6], prev_T[10]))

    # Check mutual orthogonality.
    for ia in range(3):
        for ib in range(ia + 1, 3):
            dot = sum(axes[ia][k] * axes[ib][k] for k in range(3))
            if abs(dot) > _ORTHO_TOL:
                angle_deg = math.degrees(math.asin(min(1.0, abs(dot))))
                return False, (
                    f"Joints {joints[ia]} and {joints[ib]} translation axes deviate "
                    f"from orthogonal by ~{angle_deg:.1f}° — "
                    "cartesian_xyz block requires mutually orthogonal axes."
                )

    return True, ""


def _now() -> str:
    return datetime.now(UTC).isoformat()
