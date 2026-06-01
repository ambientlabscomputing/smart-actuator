"""Typed IK error hierarchy."""

from __future__ import annotations


class IKError(RuntimeError):
    """Base class for all IK failures."""


class IKUnreachable(IKError):
    """
    The requested pose is geometrically outside the machine's reachable workspace.
    Raised before any solver is invoked.
    """


class IKNoSolution(IKError):
    """
    The requested pose is inside the workspace envelope but the solver failed
    to converge within the configured iteration / tolerance budget.
    """

    def __init__(self, message: str, residual_m: float = 0.0) -> None:
        super().__init__(message)
        self.residual_m = residual_m
