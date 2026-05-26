from brain.models.motion import (
    ActuatorTrajectorySegment,
    JointTrajectory,
    MoveCommand,
    MovePrimitive,
    Pose,
)
from brain.repository.repository import Repository
from brain.service.kinematics_service import KinematicsService
from brain.service.sidecar_bridge import SidecarBridge
from brain.utils.config import Config
from brain.utils.logger import logger


class MotionService:
    """
    Trajectory generation and execution (C3).

    Converts high-level move commands into joint-space trajectories, splits
    them into per-actuator segments, and hands those to the SidecarBridge
    with a common start_time. Also owns pause/resume/abort across all joints.
    """

    def __init__(
        self,
        repository: Repository,
        sidecar: SidecarBridge,
        kinematics: KinematicsService,
        config: Config,
    ) -> None:
        self._repository = repository
        self._sidecar = sidecar
        self._kinematics = kinematics
        self._config = config

    async def generate_trajectory(self, machine_id: str, command: MoveCommand) -> JointTrajectory:
        """Convert a MoveCommand into a timed joint-space trajectory."""
        logger.debug("Generating trajectory for %s on machine %s", command.primitive, machine_id)
        # TODO: dispatch to the appropriate trajectory planner by primitive type
        return JointTrajectory(machine_id=machine_id)

    async def execute(self, machine_id: str, trajectory: JointTrajectory) -> None:
        """
        Split the whole-machine trajectory into per-actuator segments and
        send them to the sidecar with a synchronised start_time.
        """
        segments = self._split_trajectory(machine_id, trajectory)
        await self._sidecar.send_trajectory_segments(segments)

    async def pause(self, machine_id: str) -> None:
        """Pause execution on all actuators atomically."""
        logger.info("Pausing motion on machine %s", machine_id)
        # TODO: send pause command via sidecar

    async def resume(self, machine_id: str) -> None:
        """Resume a paused execution."""
        logger.info("Resuming motion on machine %s", machine_id)
        # TODO: send resume command via sidecar

    async def abort(self, machine_id: str) -> None:
        """Abort the current trajectory and decelerate to a stop."""
        logger.warning("Aborting motion on machine %s", machine_id)
        # TODO: send abort command via sidecar

    async def move_joint(self, machine_id: str, joint_targets: dict[str, float]) -> None:
        """Move one or more joints to target angles (rad)."""
        cmd = MoveCommand(primitive=MovePrimitive.MOVE_J, joint_targets=joint_targets)
        traj = await self.generate_trajectory(machine_id, cmd)
        await self.execute(machine_id, traj)

    async def move_linear(self, machine_id: str, target: Pose) -> None:
        """Move the end-effector in a straight Cartesian line to *target*."""
        cmd = MoveCommand(primitive=MovePrimitive.MOVE_L, target_pose=target)
        traj = await self.generate_trajectory(machine_id, cmd)
        await self.execute(machine_id, traj)

    async def move_to_pose(self, machine_id: str, pose: Pose) -> None:
        """Move to a target Cartesian pose (joint-space path)."""
        cmd = MoveCommand(primitive=MovePrimitive.MOVE_TO_POSE, target_pose=pose)
        traj = await self.generate_trajectory(machine_id, cmd)
        await self.execute(machine_id, traj)

    async def follow_path(self, machine_id: str, waypoints: list[Pose]) -> None:
        """Follow a sequence of Cartesian waypoints."""
        cmd = MoveCommand(primitive=MovePrimitive.FOLLOW_PATH, waypoints=waypoints)
        traj = await self.generate_trajectory(machine_id, cmd)
        await self.execute(machine_id, traj)

    async def hold_pose(self, machine_id: str) -> None:
        """Command all joints to hold their current positions."""
        cmd = MoveCommand(primitive=MovePrimitive.HOLD_POSE)
        traj = await self.generate_trajectory(machine_id, cmd)
        await self.execute(machine_id, traj)

    async def go_home(self, machine_id: str) -> None:
        """Move to the machine's defined home configuration."""
        cmd = MoveCommand(primitive=MovePrimitive.GO_HOME)
        traj = await self.generate_trajectory(machine_id, cmd)
        await self.execute(machine_id, traj)

    def _split_trajectory(
        self, machine_id: str, trajectory: JointTrajectory
    ) -> list[ActuatorTrajectorySegment]:
        """Decompose a whole-machine trajectory into one segment per actuator."""
        # TODO: look up actuator bindings from repository, slice trajectory points
        return []
