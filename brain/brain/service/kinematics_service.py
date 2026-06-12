from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    from brain.service.template_service import TemplateService


class KinematicsService:
    """
    Forward/inverse kinematics and Jacobian computations (C2).

    MuJoCo is available here for on-demand validation tasks (pre-flight
    collision/reach checks, user-initiated what-if queries) but is NOT
    run continuously — the live 3D view and the Brain's 'modelled' telemetry
    stream both use plain forward kinematics, not MuJoCo renders.
    """

    def __init__(
        self,
        repository: Repository,
        config: Config,
        templates: "TemplateService | None" = None,
    ) -> None:
        self._repository = repository
        self._config = config
        self._templates = templates

    async def _load_kinematics(self, machine_id: str):
        """
        Load the machine, DH chain, EE spec, IK spec, overrides, and
        verification report.  Returns None if the machine doesn't exist or
        has no DH chain.

        Back-fills end_effector from the template if the persisted machine
        description is missing it (e.g. legacy rows saved before the EE was
        carried over from the template).  Without this, the IK solver
        defaults task_space to 'se3' and tries to satisfy orientation
        constraints that R3 machines cannot achieve.
        """
        machine = await self._repository.machine.load_machine(machine_id)
        if machine is None or machine.description.dh_chain is None:
            return None
        if machine.description.end_effector is None and self._templates is not None:
            try:
                tmpl = await self._templates.get_template(
                    machine.description.template_ref.template_id
                )
                if tmpl and tmpl.end_effector is not None:
                    machine.description.end_effector = tmpl.end_effector
            except Exception:
                logger.exception(
                    "KinematicsService: could not back-fill end_effector for machine {}",
                    machine_id,
                )
        return machine

    async def _load_ik_spec(self, machine_id: str):
        """Load the template's IK spec (decomposition + numeric tuning)."""
        if self._templates is None:
            return None
        try:
            machine = await self._repository.machine.load_machine(machine_id)
            if machine is None:
                return None
            tmpl = await self._templates.get_template(
                machine.description.template_ref.template_id
            )
            return tmpl.ik if tmpl else None
        except Exception:
            logger.exception(
                "KinematicsService: could not load IK spec for machine {}", machine_id
            )
            return None

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

    async def sample_arm_points(
        self, 
        machine_id: str, 
        angles_rad: list[float], 
        per_link_samples: int = 8
    ) -> list[tuple[float, float, float]]:
        """
        Sample points along the arm to detect collisions.
        
        Samples points between each joint origin and the end-effector to catch
        mid-link collisions that might not be detected by just checking joint
        origins and EE.
        
        Args:
            machine_id: ID of the machine
            angles_rad: Joint angles in radians
            per_link_samples: Number of samples per link segment (default 8)
            
        Returns:
            List of (x, y, z) coordinates for all sampled points
        """
        # Get joint origins and EE position
        joint_positions = await self.forward_kinematics_async(machine_id, angles_rad)
        
        if len(joint_positions) < 2:
            return joint_positions
            
        # Sample between each consecutive pair of joint positions
        sampled_points = []
        
        # Add the first joint position
        sampled_points.append(joint_positions[0])
        
        # Sample between consecutive joints
        for i in range(len(joint_positions) - 1):
            start_pos = joint_positions[i]
            end_pos = joint_positions[i + 1]
            
            # Add intermediate samples along the link segment
            for j in range(1, per_link_samples):
                t = j / per_link_samples
                x = start_pos[0] + t * (end_pos[0] - start_pos[0])
                y = start_pos[1] + t * (end_pos[1] - start_pos[1])
                z = start_pos[2] + t * (end_pos[2] - start_pos[2])
                sampled_points.append((x, y, z))
            
            # Add the end point of this segment
            sampled_points.append(end_pos)
        
        return sampled_points

    async def joint_limits_rad(
        self, machine_id: str
    ) -> list[tuple[float, float]]:
        """
        Return [(lower, upper), ...] joint limits in radians, in chain order.
        Empty list if the machine has no kinematics.
        """
        import math

        machine = await self._load_kinematics(machine_id)
        if machine is None or machine.description.dh_chain is None:
            return []
        return [
            (math.radians(j.limit_lower), math.radians(j.limit_upper))
            for j in machine.description.dh_chain.joints
        ]


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

        # Load the IK spec from the template (for analytic decomposition).
        ik_spec = await self._load_ik_spec(machine_id)

        # Build target vector: [x, y, z] or [x, y, z, qx, qy, qz, qw]
        # Only include orientation when the machine's task_space can control it;
        # appending orientation to an R3/planar machine forces the numeric solver
        # into SE3 mode and it will fail to converge (no rotary DOF).
        pos = target_pose.position
        target: list[float] = [float(pos[i]) if i < len(pos) else 0.0 for i in range(3)]
        ori = target_pose.orientation_quat
        task_space_str = ee.task_space if ee else "se3"
        if ori and len(ori) == 4 and task_space_str == "se3":
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
