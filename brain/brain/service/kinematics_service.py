from brain.models.motion import JointTrajectory, Pose
from brain.models.state import JointState, LinkPose
from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger


class KinematicsService:
    """
    Forward/inverse kinematics and Jacobian computations (C2).

    MuJoCo is available here for on-demand validation tasks (pre-flight
    collision/reach checks, user-initiated what-if queries) but is NOT
    run continuously — the live 3D view and the Brain's 'modeled' telemetry
    stream both use plain forward kinematics, not MuJoCo renders.
    """

    def __init__(self, repository: Repository, config: Config) -> None:
        self._repository = repository
        self._config = config

    def forward_kinematics(self, machine_id: str, joint_state: list[JointState]) -> list[LinkPose]:
        """Compute link poses from joint angles using the machine's URDF."""
        # TODO: load URDF for machine_id, run FK chain
        return []

    def inverse_kinematics(self, machine_id: str, target_pose: Pose) -> list[JointState]:
        """
        Compute joint targets that achieve *target_pose*.
        Raises if no IK solution exists within the machine's feasibility bounds.
        """
        # TODO: run IK solver (redundancy resolution policy TBD)
        return []

    def jacobian(self, machine_id: str, joint_state: list[JointState]) -> list[list[float]]:
        """
        Return the geometric Jacobian matrix (6×n, row-major) for
        Cartesian velocity mapping.
        """
        # TODO: compute Jacobian from URDF at given joint configuration
        return []

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
