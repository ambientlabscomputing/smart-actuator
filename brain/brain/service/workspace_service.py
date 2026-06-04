"""
WorkspaceService — reachable end-effector workspace for a machine.

Computes a sampled point cloud of end-effector positions across the full
joint-space, builds a 3-D convex hull, and persists the result alongside
the machine in the database.  The result is also queryable by other services
(MotionService, SafetyService) via contains() / reach_max() / reach_min().

Design decisions (see plan):
• Representation : point cloud + convex hull (vertices, faces, hyperplane eqs).
• Sampling       : uniform grid in joint space, budget ≤ 50 000 samples.
• Degeneracy     : planar machines get their points duplicated at ±link_radius
                   so the hull is a valid 3-D thin disc rather than degenerate.
• Persistence    : eager — recomputed and saved in every build_machine /
                   update call; keyed by SHA-256 hash of the DH chain JSON.
• Contains check : scipy ConvexHull hyperplane equations (half-space test).
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from brain.models.machine import WorkspaceHull, WorkspaceResult
from brain.service.dh_fk import ee_position_with_spec
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, DHChainSchema, EndEffectorSpec
    from brain.repository.repository import Repository
    from brain.service.kinematics_service import KinematicsService
    from brain.service.template_service import TemplateService
    from brain.utils.config import Config


# ── Default sampling budget ───────────────────────────────────────────────────
_DEFAULT_BUDGET = 50_000

# Bump this whenever the FK math or sampling algorithm changes so existing
# cached workspace blobs are detected as stale and recomputed on next read.
_ALGO_VERSION = "v2"


class WorkspaceService:
    """
    Computes, persists, and queries the reachable end-effector workspace for a
    machine.  Consumed by MotionService (waypoint reach check), SafetyService
    (jog-step reach check), and the frontend visualisation toggle.
    """

    def __init__(
        self,
        repository: "Repository",
        kinematics: "KinematicsService",
        templates: "TemplateService",
        config: "Config",
        *,
        sample_budget: int = _DEFAULT_BUDGET,
    ) -> None:
        self._repository = repository
        self._kinematics = kinematics
        self._templates = templates
        self._config = config
        self._budget = sample_budget

    # ── Public service API ────────────────────────────────────────────────────

    async def get(self, machine_id: str) -> WorkspaceResult | None:
        """
        Return the persisted WorkspaceResult for *machine_id*, or None.

        If the cached blob's dh_hash doesn't match the machine's current DH
        chain (e.g. the FK algorithm version bumped, or DH was edited via a
        path that skipped eager recompute), we recompute and persist on the fly.
        """
        cached = await self._repository.machine.load_workspace(machine_id)

        machine = await self._repository.machine.load_machine(machine_id)
        if machine is None or machine.description.dh_chain is None:
            return cached

        expected_hash = _hash_dh(machine.description.dh_chain, machine.description.end_effector)
        if cached is not None and cached.dh_hash == expected_hash:
            return cached

        # Stale or missing — recompute and persist.
        try:
            return await self.recompute(machine_id, created_by="auto")
        except Exception:
            logger.exception("Auto-recompute of workspace failed for {} — returning stale", machine_id)
            return cached

    async def recompute(self, machine_id: str, *, created_by: str = "system") -> WorkspaceResult:
        """
        Force-recompute the workspace from the machine's current DH chain
        and persist it.  Returns the new WorkspaceResult.
        """
        machine = await self._repository.machine.load_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")

        dh = machine.description.dh_chain
        if dh is None:
            raise ValueError(f"Machine {machine_id!r} has no DH chain — cannot compute workspace")

        template_id = machine.description.template_ref.template_id
        tmpl = await self._templates.get_template(template_id)
        schema = tmpl.dh if tmpl else None

        # EE spec: prefer the machine-persisted override, fall back to template default.
        ee = machine.description.end_effector
        if ee is None and tmpl is not None:
            ee = tmpl.end_effector

        result = self._compute(dh, schema, ee=ee)
        await self._repository.machine.save_workspace(machine_id, result)
        logger.info(
            "Workspace computed for machine {} — {} points, volume={:.4f} m³",
            machine_id,
            len(result.points),
            result.stats.get("volume", 0.0),
        )
        return result

    async def compute_for_machine_object(
        self,
        machine_id: str,
        dh: "DHChainValues",
        schema: "DHChainSchema | None",
        ee: "EndEffectorSpec | None" = None,
    ) -> WorkspaceResult:
        """
        Compute and persist workspace directly from a DHChainValues object
        (called from MachineService so we don't need to reload from DB).
        Returns the new WorkspaceResult.
        """
        result = self._compute(dh, schema, ee=ee)
        await self._repository.machine.save_workspace(machine_id, result)
        return result

    async def contains(self, machine_id: str, point: tuple[float, float, float]) -> bool:
        """
        Return True if *point* lies inside (or on) the machine's reachable
        workspace hull.  Loads the persisted hull, computing it on demand when
        no cached result exists (e.g. legacy machines saved before the EE spec
        was carried over from the template).
        """
        result = await self._repository.machine.load_workspace(machine_id)
        if result is None or result.hull is None:
            try:
                result = await self.recompute(machine_id)
            except Exception:
                logger.exception(
                    "Lazy workspace compute failed for machine {}", machine_id
                )
                return False
            if result is None or result.hull is None:
                return False
        return _point_in_hull(point, result.hull.equations)

    async def invalidate(self, machine_id: str) -> None:
        """
        Delete the cached workspace for *machine_id*.
        The next call to ``get()`` or ``contains()`` will return None/False
        until a new recompute is triggered.
        """
        try:
            await self._repository.machine.delete_workspace(machine_id)
        except Exception:
            pass  # Best-effort — not fatal if delete fails or wasn't persisted

    async def reach_max(self, machine_id: str) -> float:
        """Maximum distance from origin to any reachable EE position (metres)."""
        result = await self._repository.machine.load_workspace(machine_id)
        if result is None:
            return 0.0
        return result.stats.get("reach_max", 0.0)

    async def reach_min(self, machine_id: str) -> float:
        """Minimum distance from origin to any reachable EE position (metres)."""
        result = await self._repository.machine.load_workspace(machine_id)
        if result is None:
            return 0.0
        return result.stats.get("reach_min", 0.0)

    # ── Internal compute ──────────────────────────────────────────────────────

    def _compute(
        self,
        dh: "DHChainValues",
        schema: "DHChainSchema | None",
        ee: "EndEffectorSpec | None" = None,
    ) -> WorkspaceResult:
        """
        Sample the joint space uniformly, compute FK for each sample, build
        a convex hull, and return a WorkspaceResult.
        """
        n_joints = len(dh.joints)
        if n_joints == 0:
            return _empty_result(dh)

        # Per-joint resolution from budget
        k = max(2, int(self._budget ** (1.0 / n_joints)))

        # Build per-joint sample grids in SI units (radians for revolute,
        # metres for prismatic).  Without honouring the joint type the
        # prismatic 0.3 m limit collapses to 0.005 "rad", producing a hull
        # only ~5 mm on a side.
        from brain.models.machine import joint_limit_to_si
        grids: list[list[float]] = []
        for jv in dh.joints:
            lo = joint_limit_to_si(jv, jv.limit_lower)
            hi = joint_limit_to_si(jv, jv.limit_upper)
            if lo >= hi:
                hi = lo + 1e-6
            step = (hi - lo) / (k - 1) if k > 1 else 0.0
            grids.append([lo + step * j for j in range(k)])

        # Sample all combinations via a simple nested counter
        points: list[tuple[float, float, float]] = []
        indices = [0] * n_joints

        while True:
            angles = [grids[i][indices[i]] for i in range(n_joints)]
            x, y, z = ee_position_with_spec(dh, angles, ee)
            points.append((x, y, z))

            # Increment multi-dimensional index
            carry = True
            for dim in range(n_joints - 1, -1, -1):
                if carry:
                    indices[dim] += 1
                    if indices[dim] >= k:
                        indices[dim] = 0
                    else:
                        carry = False
            if carry:
                break  # all indices rolled over

        # Deduplicate points (planar arms collapse to a line/curve)
        points = list({(round(x, 6), round(y, 6), round(z, 6)) for x, y, z in points})

        # Planar degeneracy: if all z-values are nearly the same, extrude
        zs = [p[2] for p in points]
        z_range = max(zs) - min(zs) if zs else 0.0
        link_r = dh.link_radius if dh.link_radius > 0 else 0.01
        if z_range < link_r * 0.5:
            # Duplicate at ±link_radius to make a valid 3-D hull
            top = [(x, y, z + link_r) for x, y, z in points]
            bot = [(x, y, z - link_r) for x, y, z in points]
            points = points + top + bot

        # Build convex hull
        hull_result = _build_hull(points)

        # Stats
        dists = [math.sqrt(x**2 + y**2 + z**2) for x, y, z in
                 [(p[0], p[1], p[2]) for p in
                  [(v[0], v[1], v[2]) for v in (hull_result.vertices if hull_result else [])]]]
        reach_max = max(dists) if dists else 0.0
        reach_min = min(dists) if dists else 0.0

        dh_hash = _hash_dh(dh, ee)

        return WorkspaceResult(
            dh_hash=dh_hash,
            points=points,
            hull=hull_result,
            bounds={
                "min": [
                    min(p[0] for p in points),
                    min(p[1] for p in points),
                    min(p[2] for p in points),
                ],
                "max": [
                    max(p[0] for p in points),
                    max(p[1] for p in points),
                    max(p[2] for p in points),
                ],
            },
            stats={
                "n_samples": len(points),
                "volume": hull_result.volume if hull_result else 0.0,
                "hull_area": hull_result.area if hull_result else 0.0,
                "reach_max": reach_max,
                "reach_min": reach_min,
            },
            generated_at=datetime.now(UTC).isoformat(),
        )


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _build_hull(points: list[tuple[float, float, float]]) -> "WorkspaceHull | None":
    """Build a ConvexHull and return a WorkspaceHull.  Returns None on failure."""
    try:
        from scipy.spatial import ConvexHull  # type: ignore[import-untyped]
        import numpy as np  # type: ignore[import-untyped]
    except ImportError:
        logger.warning("scipy not installed — workspace hull will be empty")
        return None

    try:
        pts = np.array(points, dtype=float)
        hull = ConvexHull(pts)
        verts = pts[hull.vertices].tolist()
        # Remap face indices to the compressed vertex list
        old_to_new = {old: new for new, old in enumerate(hull.vertices)}
        faces = [[old_to_new[i] for i in simplex] for simplex in hull.simplices]
        equations = hull.equations.tolist()  # shape (n_facets, 4): [a, b, c, d]
        return WorkspaceHull(
            vertices=verts,
            faces=faces,
            equations=equations,
            volume=float(hull.volume),
            area=float(hull.area),
        )
    except Exception:
        logger.exception("ConvexHull construction failed — returning None")
        return None


def _point_in_hull(
    point: tuple[float, float, float],
    equations: list[list[float]],
) -> bool:
    """
    Half-space test using the hull's hyperplane equations.
    Each equation is [a, b, c, d] satisfying  a*x + b*y + c*z + d <= 0
    for interior points (scipy convention).
    Returns True if the point satisfies all half-space constraints.
    """
    x, y, z = point
    for eq in equations:
        a, b, c, d = eq
        if a * x + b * y + c * z + d > 1e-10:
            return False
    return True


def _hash_dh(dh: "DHChainValues", ee: "EndEffectorSpec | None" = None) -> str:
    payload = json.dumps(
        {
            "algo": _ALGO_VERSION,
            "dh": dh.model_dump(),
            "ee": ee.model_dump() if ee is not None else None,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _empty_result(dh: "DHChainValues", ee: "EndEffectorSpec | None" = None) -> WorkspaceResult:
    return WorkspaceResult(
        dh_hash=_hash_dh(dh, ee),
        points=[],
        hull=None,
        bounds={"min": [0, 0, 0], "max": [0, 0, 0]},
        stats={"n_samples": 0, "volume": 0.0, "hull_area": 0.0, "reach_max": 0.0, "reach_min": 0.0},
        generated_at=datetime.now(UTC).isoformat(),
    )
