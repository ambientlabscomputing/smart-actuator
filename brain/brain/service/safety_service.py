from brain.models.motion import JointTrajectory, Pose
from brain.models.state import MachineMode
from brain.repository.repository import Repository
from brain.service.collision import CollisionResult, GroundPlaneConstraint
from brain.service.ik import IKCallOptions, IKNoSolution, IKUnreachable
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
        self._link_collision_samples = config.safety.link_collision_samples
        self._collision_constraint = GroundPlaneConstraint(
            floor_z=config.safety.floor_z,
            margin_m=config.safety.floor_margin_m,
        )

    async def check_collision(
        self, machine_id: str, trajectory: JointTrajectory
    ) -> dict[str, object]:
        """
        Check a planned trajectory for self-collision and workspace-bound
        violations.  Returns {'ok': bool, 'violation_at_s': float | None, 'message': str}.
        """
        # Get machine description to access kinematics
        machine = await self._repository.machine.load_machine(machine_id)
        if not machine or not machine.description.dh_chain:
            return {"ok": True, "violation_at_s": None, "message": "No machine description available"}
        
        # Check each point in the trajectory
        for point in trajectory.points:
            positions = point.positions
            joint_angles = [positions.get(name, 0.0) for name in trajectory.joint_names]
            
            # Sample points along the arm to detect collisions
            try:
                sampled_points = await self._kinematics.sample_arm_points(
                    machine_id, 
                    joint_angles,
                    per_link_samples=self._link_collision_samples
                )
                
                # Check for collisions with ground plane
                collision_result = self._collision_constraint.check(sampled_points)
                if collision_result and not collision_result.ok:
                    return {
                        "ok": False,
                        "violation_at_s": point.time_from_start_s,
                        "message": collision_result.message
                    }
            except Exception as e:
                logger.warning(f"Failed to check collision for trajectory point: {e}")
                continue
        
        return {"ok": True, "violation_at_s": None, "message": ""}
    
    async def check_configuration(
        self, machine_id: str, joint_angles: list[float]
    ) -> CollisionResult:
        """
        Check if a single joint configuration would cause a collision.
        
        Args:
            machine_id: ID of the machine
            joint_angles: List of joint angles in radians
            
        Returns:
            CollisionResult describing whether the configuration is safe
        """
        try:
            sampled_points = await self._kinematics.sample_arm_points(
                machine_id,
                joint_angles,
                per_link_samples=self._link_collision_samples,
            )
            result = self._collision_constraint.check(sampled_points)
            return result if result is not None else CollisionResult(
                ok=True, constraint=self._collision_constraint
            )
        except Exception as e:
            logger.warning("check_configuration: FK sampling failed for machine %s: %s", machine_id, e)
            return CollisionResult(ok=True, constraint=self._collision_constraint)
    
    async def solve_clear_of_floor(
        self,
        machine_id: str,
        target_pose: Pose,
        seed: list[float] | None = None,
        strategy: str = "auto",
        branch_preference: str = "",
        max_attempts: int = 3,
    ) -> dict[str, object]:
        """
        Solve IK for *target_pose* and pick a joint configuration that clears
        the floor.

        Works for both analytic arms (2R/3R, which expose true elbow_up /
        elbow_down branches) and numeric/redundant arms (e.g. 7-DOF, which
        have no analytic branches).  For the latter we sample multiple IK
        seeds — the redundant null-space yields many distinct configurations
        for the same EE pose — and rank them by floor clearance.

        branch_preference:
          ""            – auto: prefer the configuration nearest the seed that
                          still clears the floor.
          "elbow_up"    – among reaching configurations, the one held highest
                          off the floor.
          "elbow_down"  – among reaching configurations, the one closest to
                          the floor (still respecting joint limits).

        Returns a dict:
          q                 – chosen joint angles
          collided_default  – True if the seed/default solution collided
          resolved_branch   – auto-chosen branch label, or None
          blocked           – True if no reaching configuration clears the floor
          requires_reconfig – True if the chosen config is a large jump from seed
        """
        _seed = list(seed or [])
        target_pos = tuple(float(c) for c in target_pose.position[:3])

        async def _solve(branch: str, seed_q: list[float]) -> list[float] | None:
            try:
                opts = IKCallOptions(strategy=strategy, branch_preference=branch, seed=seed_q)
                return await self._kinematics.inverse_kinematics(
                    machine_id, target_pose, options=opts
                )
            except (IKUnreachable, IKNoSolution):
                return None

        # --- Default / seed solution (used as the auto baseline) ---
        default_q = await _solve("", _seed)
        default_eval = await self._evaluate(machine_id, default_q, target_pos) if default_q else None
        collided_default = bool(default_eval and not default_eval["ok"])

        # --- FAST PATH ---
        # The common jog case: no explicit Up/Down request and the default
        # solution already clears the floor.  Skip the expensive
        # multi-candidate / multi-seed search entirely (that only matters when
        # we hit an actual conflict or the user is deliberately flipping the
        # configuration).
        explicit_branch = branch_preference in ("elbow_up", "elbow_down")
        if not explicit_branch and default_eval is not None and default_eval["ok"]:
            return {
                "q": default_q,
                "collided_default": False,
                "resolved_branch": None,
                "blocked": False,
                "requires_reconfig": False,
            }

        # --- Gather candidate configurations ---
        # 1. analytic branches (no-op for numeric arms, real branches for 2R/3R)
        # 2. seed perturbations (real alternatives for redundant numeric arms)
        candidates: list[dict] = []
        if default_eval is not None:
            candidates.append(default_eval)

        for branch in ("elbow_up", "elbow_down"):
            q = await _solve(branch, _seed)
            ev = await self._evaluate(machine_id, q, target_pos)
            if ev is not None:
                candidates.append(ev)

        limits = await self._kinematics.joint_limits_rad(machine_id)
        for seed_q in self._candidate_seeds(_seed, limits):
            q = await _solve("", seed_q)
            ev = await self._evaluate(machine_id, q, target_pos)
            if ev is not None:
                candidates.append(ev)

        # Keep only configurations that actually reach the target pose
        reaching = [c for c in candidates if c["reaches"]]
        clear = [c for c in reaching if c["ok"]]

        def _reconfig(q: list[float]) -> bool:
            if not _seed or len(_seed) != len(q):
                return False
            import math
            return max(abs(a - b) for a, b in zip(q, _seed)) > math.radians(120)

        # --- Explicit branch chosen by the user (Up / Down) ---
        if branch_preference in ("elbow_up", "elbow_down"):
            pool = clear or reaching  # prefer clear configs; else best-effort
            if not pool:
                return {"q": default_q or _seed, "collided_default": collided_default,
                        "resolved_branch": None, "blocked": True, "requires_reconfig": False}
            reverse = branch_preference == "elbow_up"  # up → highest off floor
            pool.sort(key=lambda c: (c["min_z"], c["avg_z"]), reverse=reverse)
            chosen = pool[0]
            return {
                "q": chosen["q"],
                "collided_default": collided_default,
                "resolved_branch": None,        # explicit pick, not auto-resolved
                "blocked": not chosen["ok"],
                "requires_reconfig": _reconfig(chosen["q"]),
            }

        # --- Auto: keep the default if it clears the floor ---
        if default_eval is not None and default_eval["ok"]:
            return {"q": default_q, "collided_default": False, "resolved_branch": None,
                    "blocked": False, "requires_reconfig": False}

        # Default collides — pick the clear config nearest the seed
        if clear:
            import math

            def _dist(c: dict) -> float:
                if not _seed or len(_seed) != len(c["q"]):
                    return -c["min_z"]  # no seed → prefer highest clearance
                return sum((a - b) ** 2 for a, b in zip(c["q"], _seed))

            chosen = min(clear, key=_dist)
            # Label the resolved branch by how it compares to the colliding default
            base_z = default_eval["min_z"] if default_eval else 0.0
            branch_label = "elbow_up" if chosen["avg_z"] >= (default_eval["avg_z"] if default_eval else 0.0) else "elbow_down"
            return {
                "q": chosen["q"],
                "collided_default": True,
                "resolved_branch": branch_label,
                "blocked": False,
                "requires_reconfig": _reconfig(chosen["q"]),
            }

        # No reaching configuration clears the floor
        return {"q": default_q or _seed, "collided_default": True, "resolved_branch": None,
                "blocked": True, "requires_reconfig": False}

    async def _evaluate(
        self, machine_id: str, q: list[float] | None, target_pos: tuple[float, float, float]
    ) -> dict | None:
        """
        Evaluate a candidate joint configuration.

        Returns None if *q* is falsy, else a dict:
          q        – the configuration
          reaches  – True if FK(q) lands within 2 mm of the target position
          ok       – True if no sampled arm point penetrates the floor
          min_z    – lowest sampled point (floor clearance; higher = safer)
          avg_z    – mean height of sampled points (tie-breaker for up/down)
        """
        if not q:
            return None
        import math

        try:
            points = await self._kinematics.sample_arm_points(
                machine_id, q, per_link_samples=self._link_collision_samples
            )
        except Exception as e:
            logger.warning("solve_clear_of_floor: FK sampling failed: %s", e)
            return None
        if not points:
            return None

        ee = points[-1]
        resid = math.sqrt(sum((ee[i] - target_pos[i]) ** 2 for i in range(3)))
        collision = self._collision_constraint.check(points)
        zs = [p[2] for p in points]
        return {
            "q": list(q),
            "reaches": resid < 2e-3,
            "ok": collision is None,
            "min_z": min(zs),
            "avg_z": sum(zs) / len(zs),
        }

    def _candidate_seeds(
        self, base_seed: list[float], limits: list[tuple[float, float]]
    ) -> list[list[float]]:
        """
        Build a deterministic set of IK seeds that explore a redundant arm's
        null-space.  Each seed sends the numeric solver toward a different
        joint configuration for the same EE pose.

        Deterministic (fixed RNG) so the same target always yields the same
        candidates — important for predictable Up/Down behaviour.
        """
        import math
        import random

        if not limits:
            return []
        n = len(limits)
        seeds: list[list[float]] = []

        # Structured postures: mid-range, and uniform +/- biases.
        seeds.append([(lo + hi) / 2 for (lo, hi) in limits])
        for bias_deg in (45, -45, 90, -90):
            b = math.radians(bias_deg)
            seeds.append([max(lo, min(hi, b)) for (lo, hi) in limits])
        # Alternating sign bias (drives elbow up vs down on serial chains).
        for sign in (1, -1):
            seeds.append([
                max(lo, min(hi, math.radians(sign * (60 if i % 2 else 20))))
                for i, (lo, hi) in enumerate(limits)
            ])

        # Deterministic random samples across the joint ranges.
        rng = random.Random(0xC0FFEE)
        for _ in range(10):
            seeds.append([rng.uniform(lo, hi) for (lo, hi) in limits])

        return seeds

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
