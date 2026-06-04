"""
Closed registry mapping block kind strings to solver callables.

Each solver callable has the signature:
    solve_block(
        dh: DHChainValues,
        joint_indices: list[int],
        target: list[float],       # [x, y, z] or [x, y, z, qx, qy, qz, qw]
        ee: EndEffectorSpec | None,
        branch_preference: str,    # "elbow_up" | "elbow_down" | "nearest"
        current_q: list[float],    # current joint angles (rad), len == n_joints
    ) -> list[float] | None        # joint angles (rad) for the block's joints,
                                   # or None if the block cannot solve this target.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec

SolverFn = Callable[
    [
        "DHChainValues",    # full dh chain
        list[int],          # joint slot indices for this block
        list[float],        # target: position (3) or pose (7)
        "EndEffectorSpec | None",
        str,                # branch_preference
        list[float],        # current_q for all joints
    ],
    list[float] | None,
]

# Import block solvers (deferred to avoid circular imports)
def _get_registry() -> dict[str, SolverFn]:
    from brain.service.ik.blocks.single_axis import solve_revolute, solve_prismatic
    from brain.service.ik.blocks.cartesian import solve_cartesian_xyz
    from brain.service.ik.blocks.planar_2r import solve_planar_2r
    from brain.service.ik.blocks.planar_3r import solve_planar_3r
    from brain.service.ik.blocks.rrr_anthropomorphic import solve_rrr_anthropomorphic
    from brain.service.ik.blocks.spherical_wrist import solve_spherical_wrist
    from brain.service.ik.blocks.numeric_block import solve_numeric_block

    return {
        "revolute":              solve_revolute,
        "prismatic":             solve_prismatic,
        "cartesian_xyz":         solve_cartesian_xyz,
        "planar_2r":             solve_planar_2r,
        "planar_3r":             solve_planar_3r,
        "rrr_anthropomorphic":   solve_rrr_anthropomorphic,
        "spherical_wrist":       solve_spherical_wrist,
        "numeric":               solve_numeric_block,
    }


def get_solver(kind: str) -> SolverFn | None:
    """Return the solver callable for *kind*, or None if unknown."""
    return _get_registry().get(kind)
