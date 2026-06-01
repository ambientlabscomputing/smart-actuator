"""
brain.service.ik — IK solver registry and dispatch layer.

Public API:
    solve(machine, target_pose, *, seed, options) -> list[float]
    IKUnreachable — target is geometrically outside the workspace.
    IKNoSolution  — target is inside workspace but solver failed to converge.
"""

from brain.service.ik.errors import IKUnreachable, IKNoSolution
from brain.service.ik.solve import solve, IKCallOptions

__all__ = ["solve", "IKCallOptions", "IKUnreachable", "IKNoSolution"]
