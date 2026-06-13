"""
Tests for collision detection system.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from brain.service.collision.constraints import GroundPlaneConstraint
from brain.service.kinematics_service import KinematicsService
from brain.service.safety_service import SafetyService


class TestCollisionConstraints:
    """Test collision constraint implementations."""

    def test_ground_plane_constraint_no_collision(self):
        """Test that ground plane constraint passes when all points are above floor."""
        constraint = GroundPlaneConstraint(floor_z=0.0, margin_m=0.005)

        # Points all above the floor
        points = [(0.0, 0.0, 0.01), (1.0, 1.0, 0.02), (-1.0, -1.0, 0.03)]
        result = constraint.check(points)

        assert result is None  # No collision detected

    def test_ground_plane_constraint_collision(self):
        """Test that ground plane constraint detects when points are below floor."""
        constraint = GroundPlaneConstraint(floor_z=0.0, margin_m=0.005)

        # Point below the floor with margin
        points = [(0.0, 0.0, -0.01)]
        result = constraint.check(points)

        assert result is not None
        assert result.ok is False
        assert "below floor plane" in result.message
        assert result.point_index == 0
        assert result.position == (0.0, 0.0, -0.01)

    def test_ground_plane_constraint_margin(self):
        """Test that ground plane constraint respects margin."""
        constraint = GroundPlaneConstraint(floor_z=0.0, margin_m=0.005)

        # Point exactly at floor (should be allowed with 5mm margin)
        points = [(0.0, 0.0, 0.0)]
        result = constraint.check(points)

        assert result is None  # Should not collide

        # Point just below floor (should collide with 5mm margin)
        points = [(0.0, 0.0, -0.006)]
        result = constraint.check(points)

        assert result is not None
        assert result.ok is False


class TestSafetyService:
    """Test safety service collision detection."""

    def _make_safety_service(self, mock_kinematics: AsyncMock) -> SafetyService:
        from brain.utils.config import Config

        cfg = Config()  # all defaults
        return SafetyService(
            repository=MagicMock(),
            sidecar=MagicMock(),
            kinematics=mock_kinematics,
            lifecycle=MagicMock(),
            config=cfg,
        )

    @pytest.mark.anyio
    async def test_check_configuration_no_collision(self):
        """Test that check_configuration passes when no collision occurs."""
        mock_kinematics = AsyncMock()
        mock_kinematics.sample_arm_points.return_value = [(0.0, 0.0, 0.01), (1.0, 1.0, 0.02)]
        svc = self._make_safety_service(mock_kinematics)
        result = await svc.check_configuration("test_machine", [0.0, 0.0, 0.0])
        assert result.ok is True

    @pytest.mark.anyio
    async def test_check_configuration_collision(self):
        """Test that check_configuration detects collisions."""
        mock_kinematics = AsyncMock()
        mock_kinematics.sample_arm_points.return_value = [(0.0, 0.0, -0.01), (1.0, 1.0, 0.02)]
        svc = self._make_safety_service(mock_kinematics)
        result = await svc.check_configuration("test_machine", [0.0, 0.0, 0.0])
        assert result.ok is False
        assert "below floor plane" in result.message


class TestCollisionSampling:
    """Test arm sampling functionality."""

    @pytest.mark.anyio
    async def test_sample_arm_points(self):
        """sample_arm_points interpolates between joint origins and EE."""
        # Three positions: two joint origins + EE
        raw_positions = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (1.0, 1.0, 0.0)]

        # Patch forward_kinematics_async on a real (but mostly-empty) instance
        ks = KinematicsService(repository=MagicMock(), config=MagicMock())
        ks.forward_kinematics_async = AsyncMock(return_value=raw_positions)  # type: ignore[method-assign]

        points = await ks.sample_arm_points("m", [0.0, 0.0], per_link_samples=4)

        # With 2 segments × 4 intermediate steps + endpoints we get many points,
        # but the most important thing is that start and end of each segment appear.
        xs = [p[0] for p in points]
        assert 0.0 in xs  # base origin present
        assert 1.0 in xs  # joint-2 / EE x present


class TestSolveClearOfFloor:
    """
    Integration: branch selection on the 7-DOF redundant arm (seven_dof_dlr),
    which uses numeric IK with no analytic elbow_up/elbow_down branches.  The
    multi-seed solver must still produce *distinct, ordered* configurations for
    Up vs Down so the manual config toggle does something meaningful.
    """

    async def _build_services(self):
        from pathlib import Path
        from unittest.mock import AsyncMock, MagicMock

        from brain.models.machine import (
            DHChainValues,
            Machine,
            MachineDescription,
            TemplateRef,
        )
        from brain.service.template_service import TemplateService
        from brain.utils.config import Config

        templates_dir = Path(__file__).resolve().parents[1] / "templates"
        cfg = Config()
        cfg.templates.dir = str(templates_dir)
        templates = TemplateService(cfg)
        schema = await templates.get_template("seven_dof_dlr")
        dh = DHChainValues.from_schema_defaults(schema.dh)
        desc = MachineDescription(
            machine_id="m7",
            template_ref=TemplateRef(
                source="in-tree",
                template_id="seven_dof_dlr",
                version="1.0.0",
                content_hash="x",
                ref="in-tree",
            ),
            dh_chain=dh,
            end_effector=schema.end_effector,
        )
        machine = Machine(description=desc)

        repo = MagicMock()
        repo.machine = MagicMock()
        repo.machine.load_machine = AsyncMock(return_value=machine)

        ks = KinematicsService(repository=repo, config=cfg, templates=templates)
        svc = SafetyService(
            repository=repo,
            sidecar=MagicMock(),
            kinematics=ks,
            lifecycle=MagicMock(),
            config=cfg,
        )
        return svc, ks

    async def _avg_z(self, ks, q):
        pts = await ks.sample_arm_points("m7", q, per_link_samples=8)
        return sum(p[2] for p in pts) / len(pts)

    @pytest.mark.anyio
    async def test_up_and_down_are_distinct_and_ordered(self):
        import math

        from brain.models.motion import Pose

        svc, ks = await self._build_services()

        # A reachable position; orientation left free (position-only) so the
        # redundant arm has room to adopt different postures.
        target = Pose(position=[0.347, 0.0, 0.576], orientation_quat=[])

        up = await svc.solve_clear_of_floor("m7", target, branch_preference="elbow_up")
        down = await svc.solve_clear_of_floor("m7", target, branch_preference="elbow_down")

        # Both should return a 7-vector solution.
        assert len(up["q"]) == 7
        assert len(down["q"]) == 7

        # Up and Down must be genuinely different configurations.
        max_delta = max(abs(a - b) for a, b in zip(up["q"], down["q"]))
        assert max_delta > math.radians(5), "Up/Down produced effectively identical configs"

        # "Up" should hold the arm at least as high as "Down" on average.
        assert await self._avg_z(ks, up["q"]) >= await self._avg_z(ks, down["q"])

    @pytest.mark.anyio
    async def test_both_branches_reach_target(self):
        import math

        from brain.models.motion import Pose
        from brain.service.dh_fk import ee_position_with_spec

        svc, ks = await self._build_services()
        machine = await ks._load_kinematics("m7")
        dh = machine.description.dh_chain
        ee = machine.description.end_effector

        target = Pose(position=[0.347, 0.0, 0.576], orientation_quat=[])
        for branch in ("elbow_up", "elbow_down"):
            res = await svc.solve_clear_of_floor("m7", target, branch_preference=branch)
            x, y, z = ee_position_with_spec(dh, res["q"], ee)
            resid = math.sqrt((x - 0.347) ** 2 + y**2 + (z - 0.576) ** 2)
            assert resid < 5e-3, f"{branch} did not reach target (resid={resid * 1000:.1f}mm)"
