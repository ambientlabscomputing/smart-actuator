from brain.models.motion import (
    ActuatorTrajectorySegment,
    JointTrajectory,
    JointTrajectoryPoint,
    MoveCommand,
    MovePrimitive,
    Pose,
)
from brain.repository.repository import Repository
from brain.service.ik import IKCallOptions, IKNoSolution, IKUnreachable
from brain.service.kinematics_service import KinematicsService
from brain.service.sidecar_bridge import SidecarBridge
from brain.utils.config import Config
from brain.utils.logger import logger

if False:  # TYPE_CHECKING
    from brain.service.workspace_service import WorkspaceService

# Number of interpolated waypoints for MOVE_L straight-line Cartesian moves.
_MOVE_L_SEGMENTS = 10
# Default move duration when none is specified.
_DEFAULT_MOVE_DURATION_S = 2.0


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
        *,
        workspace: "WorkspaceService | None" = None,
    ) -> None:
        self._repository = repository
        self._sidecar = sidecar
        self._kinematics = kinematics
        self._config = config
        self._workspace = workspace

    async def generate_trajectory(self, machine_id: str, command: MoveCommand) -> JointTrajectory:
        """Convert a MoveCommand into a timed joint-space trajectory."""
        logger.debug("Generating trajectory for %s on machine %s", command.primitive, machine_id)

        # Reach guard: reject Cartesian move targets outside the reachable workspace.
        if self._workspace is not None and command.primitive in (
            MovePrimitive.MOVE_L, MovePrimitive.MOVE_TO_POSE
        ):
            poses_to_check: list[Pose] = []
            if command.target_pose is not None:
                poses_to_check.append(command.target_pose)
            poses_to_check.extend(command.waypoints)

            for i, pose in enumerate(poses_to_check):
                pos = pose.position
                if len(pos) < 3:
                    continue
                point = (float(pos[0]), float(pos[1]), float(pos[2]))
                inside = await self._workspace.contains(machine_id, point)
                if not inside:
                    raise ValueError(
                        f"Waypoint {i} {point} is outside the reachable workspace "
                        f"for machine {machine_id!r}. "
                        "Check link lengths and joint limits."
                    )

        # Dispatch by primitive type
        if command.primitive == MovePrimitive.MOVE_TO_POSE and command.target_pose is not None:
            return await self._plan_move_to_pose(machine_id, command)

        if command.primitive == MovePrimitive.MOVE_L and command.target_pose is not None:
            return await self._plan_move_l(machine_id, command)

        if command.primitive == MovePrimitive.FOLLOW_PATH and command.waypoints:
            return await self._plan_follow_path(machine_id, command)

        # GO_HOME, HOLD_POSE and unrecognised primitives return an empty trajectory
        return JointTrajectory(machine_id=machine_id)

    async def _ik_for_pose(
        self,
        machine_id: str,
        pose: Pose,
        command: MoveCommand,
        current_q: list[float] | None = None,
    ) -> list[float]:
        """Run IK for *pose* using options from *command*.  Raises on failure."""
        opts = IKCallOptions(
            strategy=command.ik_strategy,
            branch_preference=command.branch_preference,
            seed=command.ik_seed if command.ik_seed else [],
        )
        return await self._kinematics.inverse_kinematics(
            machine_id, pose, current_q=current_q, options=opts
        )

    async def _plan_move_to_pose(
        self, machine_id: str, command: MoveCommand
    ) -> JointTrajectory:
        """
        MOVE_TO_POSE: run IK for the target, then generate a joint-space
        trajectory by linear interpolation from current configuration.
        """
        assert command.target_pose is not None
        target_q = await self._ik_for_pose(machine_id, command.target_pose, command)
        # Linear interpolation in joint space (N+1 knots including start)
        n_points = max(2, _MOVE_L_SEGMENTS)
        duration = _DEFAULT_MOVE_DURATION_S
        points: list[JointTrajectoryPoint] = []
        # Obtain joint names from dh_chain for the positions dict
        machine = await self._repository.machine.load_machine(machine_id)
        joint_names: list[str] = []
        if machine and machine.description.dh_chain:
            joint_names = [j.name for j in machine.description.dh_chain.joints]
        for step in range(n_points):
            t = step / (n_points - 1)
            alpha = t  # linear; could be replaced with a min-jerk profile
            q = [alpha * tq for tq in target_q]  # TODO: blend from current_q when available
            positions = {name: q[k] for k, name in enumerate(joint_names) if k < len(q)}
            points.append(JointTrajectoryPoint(positions=positions, time_from_start_s=t * duration))
        return JointTrajectory(machine_id=machine_id, joint_names=joint_names, points=points)

    async def _plan_move_l(
        self, machine_id: str, command: MoveCommand
    ) -> JointTrajectory:
        """
        MOVE_L: run IK at N intermediate Cartesian poses along a straight-line
        segment, then stitch the resulting joint waypoints into a trajectory.
        """
        assert command.target_pose is not None
        target = command.target_pose
        pos = target.position
        tx, ty, tz = (float(pos[i]) if i < len(pos) else 0.0 for i in range(3))

        # TODO: obtain true current EE pose; for now interpolate from zero
        sx, sy, sz = 0.0, 0.0, 0.0

        duration = _DEFAULT_MOVE_DURATION_S
        machine = await self._repository.machine.load_machine(machine_id)
        joint_names: list[str] = []
        if machine and machine.description.dh_chain:
            joint_names = [j.name for j in machine.description.dh_chain.joints]
        points: list[JointTrajectoryPoint] = []
        current_q: list[float] | None = None
        n = _MOVE_L_SEGMENTS

        for step in range(n + 1):
            t = step / n
            interp_pose = Pose(
                position=[sx + t * (tx - sx), sy + t * (ty - sy), sz + t * (tz - sz)],
                orientation_quat=target.orientation_quat,
            )
            q = await self._ik_for_pose(machine_id, interp_pose, command, current_q=current_q)
            current_q = q
            positions = {name: q[k] for k, name in enumerate(joint_names) if k < len(q)}
            points.append(JointTrajectoryPoint(
                positions=positions,
                time_from_start_s=t * duration,
            ))

        return JointTrajectory(machine_id=machine_id, joint_names=joint_names, points=points)

    async def _plan_follow_path(
        self, machine_id: str, command: MoveCommand
    ) -> JointTrajectory:
        """
        FOLLOW_PATH: run IK at each waypoint and concatenate the resulting
        joint-space knots, distributing duration evenly.
        """
        duration = _DEFAULT_MOVE_DURATION_S
        machine = await self._repository.machine.load_machine(machine_id)
        joint_names: list[str] = []
        if machine and machine.description.dh_chain:
            joint_names = [j.name for j in machine.description.dh_chain.joints]
        n_wp = len(command.waypoints)
        dt = duration / max(n_wp, 1)
        points: list[JointTrajectoryPoint] = []
        current_q: list[float] | None = None

        for i, wp in enumerate(command.waypoints):
            q = await self._ik_for_pose(machine_id, wp, command, current_q=current_q)
            current_q = q
            positions = {name: q[k] for k, name in enumerate(joint_names) if k < len(q)}
            points.append(JointTrajectoryPoint(
                positions=positions,
                time_from_start_s=(i + 1) * dt,
            ))

        return JointTrajectory(machine_id=machine_id, joint_names=joint_names, points=points)

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
        """
        Send direct position commands to one or more joints (raw jog, J2).
        Each key in *joint_targets* is a joint name; the value is the target
        angle in radians.  No trajectory generation — commands go straight to
        the sidecar's SendCommand RPC using the actuator_id.
        """
        sims = await self._repository.sim.list_sims(machine_id)
        hardware = await self._repository.hardware.list_hardware(machine_id)
        joint_to_actuator: dict[str, str] = {}
        for row in sims:
            joint_to_actuator[row.joint_name] = row.actuator_id
        for row in hardware:
            joint_to_actuator[row.joint_name] = row.actuator_id
        for joint_name, angle_rad in joint_targets.items():
            actuator_id = joint_to_actuator.get(joint_name)
            if actuator_id is None:
                logger.warning(
                    "move_joint: no actuator bound for joint %r on machine %s — skipping",
                    joint_name,
                    machine_id,
                )
                continue
            result = await self._sidecar.send_command(actuator_id, position=angle_rad)
            if not result["success"]:
                logger.warning(
                    "move_joint: actuator %s refused command (code=%s): %s",
                    joint_name,
                    result["refusal_code"],
                    result["message"],
                )

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
