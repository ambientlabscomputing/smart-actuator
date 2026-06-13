"""
Collision detection framework for smart-actuator.

This package provides a pluggable constraint system for detecting collisions
and enforcing safety limits. It's designed to be extensible and can handle
various types of constraints including workspace boundaries, self-collision,
and custom keep-out zones.
"""

from .constraints import CollisionConstraint, CollisionResult, GroundPlaneConstraint

__all__ = ["CollisionConstraint", "CollisionResult", "GroundPlaneConstraint"]
