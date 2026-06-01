from brain.models.motion import JointTrajectory
from brain.models.state import MachineMode
from brain.repository.repository import Repository
from brain.service.kinematics_service import KinematicsService
from brain.service.sidecar_bridge import SidecarBridge
from brain.utils.config import Config
from brain.utils.logger import logger

if False:  # TYPE_CHECKING guard to avoid circular imports
    from brain.service.lifecycle_service import LifecycleService
    from brain.service.workspace_service import WorkspaceService


class SafetyService:
    """
    Whole-machine safety enforcement (C4).

    The Brain is NOT the last line of defence — the sidecar's watchdog and
    each actuator's local refusal logic are. The Brain enforces cross-joint
    and whole-machine constraints that the per-actuator layer cannot see.
    """

    def __init__(
        self,
        repository: Repository,
        sidecar: SidecarBridge,
        kinematics: KinematicsService,
        lifecycle: "LifecycleService",
        config: Config,
        *,
        workspace: "WorkspaceService | None" = None,
    ) -> None:
        self._repository = repository
        self._sidecar = sidecar
        self._kinematics = kinematics
        self._lifecycle = lifecycle
        self._config = config
        self._workspace = workspace

    async def check_collision(
        self, machine_id: str, trajectory: JointTrajectory
    ) -> dict[str, object]:
        """
        Check a planned trajectory for self-collision and workspace-bound
        violations.  Returns {'ok': bool, 'violation_at_s': float | None, 'message': str}.
        """
        # TODO: run collision check via kinematics / MuJoCo
        return {"ok": True, "violation_at_s": None, "message": ""}

    async def check_jog_target(
        self, machine_id: str, ee_target: tuple[float, float, float]
    ) -> dict[str, object]:
        """
        Check whether a jog-step target EE position lies within the machine's
        reachable workspace.  Returns {'ok': bool, 'message': str}.

        Called by the jog handler before issuing the move command.  Other
        safety layers (actuator watchdog, sidecar limits) remain active
        regardless of this check.
        """
        if self._workspace is None:
            return {"ok": True, "message": ""}
        inside = await self._workspace.contains(machine_id, ee_target)
        if inside:
            return {"ok": True, "message": ""}
        return {
            "ok": False,
            "message": (
                f"Jog target {ee_target} is outside the reachable workspace "
                f"for machine {machine_id!r}."
            ),
        }

    async def check_joint_coordination(
        self, machine_id: str, trajectory: JointTrajectory
    ) -> dict[str, object]:
        """
        Validate cross-joint constraints (e.g. singularity proximity,
        coupled-joint limits) across the full trajectory.
        Returns {'ok': bool, 'violation_at_s': float | None, 'message': str}.
        """
        # TODO: evaluate cross-joint constraint expressions from the machine model
        return {"ok": True, "violation_at_s": None, "message": ""}

    async def estop(self, machine_id: str) -> None:
        """
        E-stop: flip mode to ESTOPPED first (gates further commands), then
        fan out Abort to all actuators via the sidecar.

        No-op when already OFFLINE (nothing connected) or ESTOPPED (already done).
        """
        logger.warning("E-stop triggered for machine %s", machine_id)
        current = self._lifecycle.get_mode(machine_id)
        if current in (MachineMode.OFFLINE, MachineMode.ESTOPPED):
            logger.info(
                "E-stop no-op for machine %s: already in mode %s", machine_id, current
            )
            return
        await self._lifecycle.request_mode(machine_id, MachineMode.ESTOPPED, "estop")
        await self._sidecar.estop()

    def gate_capability(self, mode: MachineMode, capability: str) -> bool:
        """
        Return True if *capability* is permitted in the given operating mode.
        Raises if the capability is explicitly forbidden.
        """
        # TODO: load mode/capability gate table from machine model
        allowed: dict[MachineMode, set[str]] = {
            MachineMode.OFFLINE: set(),
            MachineMode.IDLE: {"describe", "calibrate", "state"},
            MachineMode.MANUAL: {"describe", "calibrate", "state", "move_joint"},
            MachineMode.RUN: {
                "describe",
                "state",
                "move_joint",
                "move_linear",
                "move_to_pose",
                "follow_path",
                "hold_pose",
                "go_home",
                "run_program",
            },
            MachineMode.FAULT: {"describe", "state", "estop"},
            MachineMode.ESTOPPED: {"describe", "state", "estop"},
        }
        return capability in allowed.get(mode, set())
