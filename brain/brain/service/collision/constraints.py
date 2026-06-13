"""
Collision constraint definitions and implementations.
"""

import abc
from dataclasses import dataclass
from typing import Protocol


@dataclass
class CollisionResult:
    """
    Result of a collision check.

    Attributes:
        ok: True if no collision detected
        constraint: The constraint that was checked (for debugging)
        point_index: Index of the first point that caused collision (if applicable)
        position: Position where collision occurred (if applicable)
        depth_m: Depth of penetration in meters (negative = inside constraint)
        message: Human-readable description of the collision
    """

    ok: bool
    constraint: "CollisionConstraint"
    point_index: int | None = None
    position: tuple[float, float, float] | None = None
    depth_m: float | None = None
    message: str = ""


class CollisionConstraint(Protocol):
    """
    Protocol for collision constraints.

    A constraint defines a region in 3D space that should not be entered.
    """

    @abc.abstractmethod
    def check(self, points: list[tuple[float, float, float]]) -> CollisionResult | None:
        """
        Check if any of the given points violate this constraint.

        Args:
            points: List of (x, y, z) coordinates to check

        Returns:
            CollisionResult if a collision is detected, None otherwise
        """
        ...


@dataclass
class GroundPlaneConstraint:
    """
    Constraint that defines a ground plane at a specific z-coordinate.

    This constraint blocks movement below the specified z-coordinate,
    with an optional safety margin.

    Attributes:
        floor_z: Z-coordinate of the ground plane (default 0.0)
        margin_m: Safety margin in meters (default 0.005 = 5mm)
    """

    floor_z: float = 0.0
    margin_m: float = 0.005  # 5mm safety margin

    def check(self, points: list[tuple[float, float, float]]) -> CollisionResult | None:
        """
        Check if any point violates the ground plane constraint.

        Args:
            points: List of (x, y, z) coordinates to check

        Returns:
            CollisionResult if a collision is detected, None otherwise
        """
        for i, (x, y, z) in enumerate(points):
            # Check if point is below floor with margin
            depth = z - self.floor_z + self.margin_m
            if depth < 0:
                return CollisionResult(
                    ok=False,
                    constraint=self,
                    point_index=i,
                    position=(x, y, z),
                    depth_m=depth,
                    message=f"Point at ({x:.3f}, {y:.3f}, {z:.3f}) below floor plane at z={self.floor_z} with margin {self.margin_m}m",
                )

        return None
