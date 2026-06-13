"""
IK decomposition composer.

Implements the two composition rules agreed in the design:
  1. Strict serial chaining — each block is solved in order, passing the
     remaining target to the next block.
  2. Position-then-orientation split — when the last block is a
     spherical_wrist, the preceding blocks solve position (to the wrist
     centre) and the wrist block solves orientation independently.

The composer returns a flat list of joint angles (rad) for all joints in the
order they appear in the decomposition, or None if any block fails.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from brain.service.ik.registry import get_solver

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec, IKSpec

_WRIST_KINDS = {"spherical_wrist"}


def compose(
    dh: DHChainValues,
    ik_spec: IKSpec,
    target: list[float],
    ee: EndEffectorSpec | None,
    current_q: list[float],
) -> list[float] | None:
    """
    Run the composed analytic solve according to the decomposition in ik_spec.

    Returns a full joint-angle vector (len == len(dh.joints)) or None if any
    block returned None.
    """
    blocks = ik_spec.decomposition
    if not blocks:
        return None

    n = len(dh.joints)
    result = list(current_q) + [0.0] * (n - len(current_q))  # safe copy

    has_wrist = blocks[-1].kind in _WRIST_KINDS

    if has_wrist and len(blocks) >= 2:
        return _compose_position_wrist(dh, blocks, target, ee, current_q, result)
    else:
        return _compose_serial(dh, blocks, target, ee, current_q, result)


def _compose_serial(
    dh: DHChainValues,
    blocks,
    target: list[float],
    ee: EndEffectorSpec | None,
    current_q: list[float],
    result: list[float],
) -> list[float] | None:
    """Solve each block in order against the same target."""
    for block in blocks:
        solver = get_solver(block.kind)
        if solver is None:
            return None

        block_result = solver(
            dh,
            block.joints,
            target,
            ee,
            block.branch_preference,
            result,  # use the evolving result as the current pose
        )
        if block_result is None:
            return None

        for k, idx in enumerate(block.joints):
            if idx < len(result):
                result[idx] = block_result[k]

    return result


def _compose_position_wrist(
    dh: DHChainValues,
    blocks,
    target: list[float],
    ee: EndEffectorSpec | None,
    current_q: list[float],
    result: list[float],
) -> list[float] | None:
    """
    Position-then-orientation split (Pieper's condition).

    1. Compute the wrist centre: p_wc = p_ee − R_ee · wrist_offset
       (for a standard ZYZ wrist, the wrist offset is [0,0,0] — the wrist
       centre equals the EE origin; future work can support a tool offset).
    2. Solve the positioning blocks against p_wc.
    3. Solve the wrist block against the desired orientation.
    """

    position_blocks = blocks[:-1]
    wrist_block = blocks[-1]

    # Wrist centre: for now, same as the EE position (no separate wrist offset).
    # A future enhancement can compute wrist_centre = p_ee - R_ee · [0,0,d_tool].
    wrist_target = target[:3] if len(target) >= 3 else [0.0, 0.0, 0.0]

    # Solve position blocks against the wrist centre target
    for block in position_blocks:
        solver = get_solver(block.kind)
        if solver is None:
            return None

        block_result = solver(
            dh,
            block.joints,
            wrist_target,
            None,  # no EE offset for inner positioning blocks
            block.branch_preference,
            result,
        )
        if block_result is None:
            return None

        for k, idx in enumerate(block.joints):
            if idx < len(result):
                result[idx] = block_result[k]

    # Solve wrist orientation against the full target (needs quaternion)
    wrist_solver = get_solver(wrist_block.kind)
    if wrist_solver is None:
        return None

    wrist_result = wrist_solver(
        dh,
        wrist_block.joints,
        target,  # full [x,y,z,qx,qy,qz,qw]
        ee,
        wrist_block.branch_preference,
        result,
    )
    if wrist_result is None:
        return None

    for k, idx in enumerate(wrist_block.joints):
        if idx < len(result):
            result[idx] = wrist_result[k]

    return result
