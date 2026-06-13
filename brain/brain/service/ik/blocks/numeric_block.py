"""
Numeric IK block — delegates to the full Jacobian numeric solver.

Used when a decomposition block has kind="numeric" (the template author's
explicit escape hatch) or when an analytic block cannot find a solution.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec


def solve_numeric_block(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],
    ee: EndEffectorSpec | None,
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    """
    Delegate to the full numeric solver (damped least squares) and return
    only the joint angles for this block's indices.

    Importing here to avoid circular dependencies at module load time.
    """
    from brain.service.ik.numeric import solve_numeric

    seed = [current_q[i] if i < len(current_q) else 0.0 for i in joint_indices]
    result = solve_numeric(dh, joint_indices, target, ee, seed=seed)
    return result
