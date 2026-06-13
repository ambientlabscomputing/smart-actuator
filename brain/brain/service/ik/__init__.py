"""
brain.service.ik — IK solver registry and dispatch layer.

Public API:
    solve(machine, target_pose, *, seed, options) -> list[float]
    IKUnreachable — target is geometrically outside the workspace.
    IKNoSolution  — target is inside workspace but solver failed to converge.
"""

from brain.service.ik.errors import IKNoSolution, IKUnreachable
from brain.service.ik.solve import IKCallOptions, solve

__all__ = ["solve", "IKCallOptions", "IKUnreachable", "IKNoSolution"]
