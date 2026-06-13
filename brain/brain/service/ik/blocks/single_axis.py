"""
Single-axis block solvers: revolute and prismatic.

A single revolute joint can only contribute a rotation around its axis —
it cannot independently satisfy a position target.  These blocks are useful
as the first joint in an anthropomorphic arm (base yaw) when composed with
a planar_2r block.

In the current composer the single revolute is solved implicitly as part of
the rrr_anthropomorphic block; these stubs are registered for completeness
and for future use in simpler 1-DOF scenarios.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec


def solve_revolute(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],
    ee: EndEffectorSpec | None,
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    """
    Single-revolute block: return the current angle as-is (the joint has one
    DOF and cannot satisfy a Cartesian target on its own).  The composer is
    responsible for calling this only when this DOF has already been resolved
    by the outer solve (e.g. base yaw in an rrr_anthropomorphic).
    """
    idx = joint_indices[0]
    return [current_q[idx] if idx < len(current_q) else 0.0]


def solve_prismatic(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],
    ee: EndEffectorSpec | None,
    branch_preference: str,
    current_q: list[float],
) -> list[float] | None:
    """
    Single-prismatic block: return current extension as-is (same reasoning as
    solve_revolute above — not independently solvable for a Cartesian target).
    """
    idx = joint_indices[0]
    return [current_q[idx] if idx < len(current_q) else 0.0]
