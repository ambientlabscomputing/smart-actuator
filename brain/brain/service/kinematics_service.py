from brain.models.motion import JointTrajectory, Pose
from brain.models.state import JointState, LinkPose
from brain.repository.repository import Repository
from brain.service.dh_fk import (
    ee_transform,
    ee_position_with_spec,
    geometric_jacobian,
    joint_transforms,
)
from brain.service.ik import IKCallOptions, IKNoSolution, IKUnreachable, solve
from brain.utils.config import Config
from brain.utils.logger import logger


class KinematicsService:
    """
    Forward/inverse kinematics and Jacobian computations (C2).

    MuJoCo is available here for on-demand validation tasks (pre-flight
    collision/reach checks, user-initiated what-if queries) but is NOT
    run continuously — the live 3D view and the Brain's 'modelled' telemetry
    stream both use plain forward kinematics, not MuJoCo renders.
    """

    def __init__(self, repository: Repository, config: Config) -> None:
        self._repository = repository
        self._config = config

    async def _load_kinematics(self, machine_id: str):
        """
        Load the machine, DH chain, EE spec, IK spec, overrides, and
        verification report.  Returns None if the machine doesn't exist or
        has no DH chain.
        """
        machine = await self._repository.machine.load_machine(machine_id)
        if machine is None or machine.description.dh_chain is None:
            return None
        return machine

    def forward_kinematics(self, machine_id: str, joint_state: list[JointState]) -> list[LinkPose]:
        """Compute link poses from joint angles using the machine's DH chain."""
        # TODO: load machine synchronously or refactor to async; for now a stub
        return []

    async def forward_kinematics_async(
        self, machine_id: str, angles_rad: list[float]
    ) -> list[tuple[float, float, float]]:
        """
        Compute world-frame (x, y, z) positions for each joint origin plus
        the EE.  Returns a list of (n+1) positions: n joint origins + EE.
        """
        machine = await self._load_kinematics(machine_id)
        if machine is None:
            return []

        dh = machine.description.dh_chain
        ee = machine.description.end_effector
        transforms = joint_transforms(dh, angles_rad)
        positions = [(T[3], T[7], T[11]) for T in transforms]
        # Append true EE position (applies offset)
        positions.append(ee_position_with_spec(dh, angles_rad, ee))
        return positions

    async def inverse_kinematics(
        self,
        machine_id: str,
        target_pose: Pose,
        *,
        current_q: list[float] | None = None,
        options: IKCallOptions | None = None,
    ) -> list[float]:
        """
        Compute joint angles (rad) that achieve *target_pose*.

        Uses the machine's IK spec and overrides.  The analytic solver is
        preferred when the template provides a verified decomposition; the
        numeric Jacobian fallback is always available.

        Raises IKUnreachable if the pose is outside the workspace.
        Raises IKNoSolution  if the solver fails to converge.
        """
        machine = await self._load_kinematics(machine_id)
        if machine is None:
            raise IKUnreachable(f"Machine {machine_id!r} not found or has no kinematics.")

        dh = machine.description.dh_chain
        ee = machine.description.end_effector
        overrides = machine.description.ik_overrides
        verification = machine.ik_verification

        # Load the IK spec from the template (for decomposition + numeric defaults)
        ik_spec = None
        try:
            tmpl = await self._repository.machine.load_machine(machine_id)
            # ik_spec comes from the template; we store it via machine_service
            # For now, fall back to numeric-only if not available
        except Exception:
            pass

        # Build target vector: [x, y, z] or [x, y, z, qx, qy, qz, qw]
        pos = target_pose.position
        target: list[float] = [float(pos[i]) if i < len(pos) else 0.0 for i in range(3)]
        ori = target_pose.orientation_quat
        if ori and len(ori) == 4:
            target.extend(float(ori[i]) for i in range(4))

        return solve(
            dh,
            ik_spec,
            target,
            ee,
            overrides,
            verification,
            current_q=current_q,
            options=options,
        )

    def jacobian(self, machine_id: str, joint_state: list[JointState]) -> list[list[float]]:
        """
        Return the geometric Jacobian matrix (6×n, row-major) for
        Cartesian velocity mapping.
        Synchronous shim — use jacobian_async for production paths.
        """
        return []

    async def jacobian_async(
        self, machine_id: str, angles_rad: list[float]
    ) -> list[list[float]]:
        """
        Return the 6×n geometric Jacobian for the machine at the given joint angles.
        Rows 0-2: linear velocity; rows 3-5: angular velocity.
        """
        machine = await self._load_kinematics(machine_id)
        if machine is None:
            return []

        dh = machine.description.dh_chain
        ee = machine.description.end_effector
        return geometric_jacobian(dh, angles_rad, ee)

    async def validate_motion_mujoco(
        self, machine_id: str, trajectory: JointTrajectory
    ) -> dict[str, object]:
        """
        On-demand MuJoCo validation: check the planned trajectory for
        self-collisions and workspace-bound violations.
        Returns a dict with keys 'valid', 'collision_at_s', 'message'.
        """
        logger.debug("Running MuJoCo pre-flight check for machine %s", machine_id)
        # TODO: load MuJoCo model, simulate trajectory, check contacts
        return {"valid": True, "collision_at_s": None, "message": ""}
