"""
ProgramService — program storage and linear execution runner (J5).

Programs are stored as an AST (see models/program.py).  J5 supports two
node kinds:
  MOVE  — attributes: {joint_name: str, target_rad: float}
  WAIT  — attributes: {duration_s: float}

The root must be a SEQUENCE node whose children are MOVE or WAIT nodes.
Any other node kinds are rejected with ValueError at save time.

Each execution is a *run* (ProgramRunState) keyed by run_id, mirroring the
CalibrationService interactive-job pattern: every state transition is
persisted to SQLite and published on the ObservabilityService event bus under
the topic "programs/runs/{run_id}".

On Brain restart, any run that was not terminal is transitioned to
"interrupted" so the client can show the correct final state.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import TYPE_CHECKING

from brain.models.program import (
    NodeKind,
    Program,
    ProgramMeta,
    ProgramNode,
    ProgramRunState,
    ProgramRunStatus,
)
from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.service.lifecycle_service import LifecycleService
    from brain.service.motion_service import MotionService
    from brain.service.observability_service import ObservabilityService
    from brain.service.state_service import StateService

# ─── Constants ────────────────────────────────────────────────────────────────

_TOLERANCE_RAD = 0.035          # ≈ 2° — matches J2 exit criterion
_STEP_TIMEOUT_S = 10.0          # per-MOVE step convergence timeout
_WAIT_POLL_S = 0.1              # sleep chunk for cooperative stop during WAIT

_TERMINAL: set[ProgramRunStatus] = {
    ProgramRunStatus.stopped,
    ProgramRunStatus.completed,
    ProgramRunStatus.faulted,
    ProgramRunStatus.interrupted,
}

_VALID_TRANSITIONS: dict[ProgramRunStatus, set[ProgramRunStatus]] = {
    ProgramRunStatus.pending:     {ProgramRunStatus.running, ProgramRunStatus.interrupted},
    ProgramRunStatus.running:     {ProgramRunStatus.stopped, ProgramRunStatus.completed, ProgramRunStatus.faulted, ProgramRunStatus.interrupted},
    ProgramRunStatus.stopped:     set(),
    ProgramRunStatus.completed:   set(),
    ProgramRunStatus.faulted:     set(),
    ProgramRunStatus.interrupted: set(),
}

# ─── Helpers ──────────────────────────────────────────────────────────────────


def _flatten_steps(root: ProgramNode) -> list[ProgramNode]:
    """Return the immediate children of the root SEQUENCE in order."""
    if root.kind != NodeKind.SEQUENCE:
        raise ValueError(f"Program root must be a SEQUENCE node, got {root.kind!r}")
    return list(root.children)


def _validate_steps(steps: list[ProgramNode]) -> None:
    """Raise ValueError if any step is not a supported node kind."""
    for i, node in enumerate(steps):
        if node.kind not in (NodeKind.MOVE, NodeKind.WAIT):
            raise ValueError(
                f"Step {i}: unsupported node kind {node.kind!r} — "
                "J5 accepts only MOVE and WAIT"
            )
        if node.kind == NodeKind.MOVE:
            if "joint_name" not in node.attributes or "target_rad" not in node.attributes:
                raise ValueError(
                    f"Step {i} (MOVE): missing required attributes 'joint_name' and/or 'target_rad'"
                )
        if node.kind == NodeKind.WAIT:
            if "duration_s" not in node.attributes:
                raise ValueError(f"Step {i} (WAIT): missing required attribute 'duration_s'")


# ─── Service ──────────────────────────────────────────────────────────────────


class ProgramService:
    """
    Program storage and interpretation (C6, J5).

    Programs are bound to a machine by machine_id on the run request, not
    at save time — the same program can be replayed against a compatible
    machine without modification.
    """

    def __init__(
        self,
        repository: Repository,
        config: Config,
        *,
        motion: "MotionService",
        state: "StateService",
        lifecycle: "LifecycleService",
        observability: "ObservabilityService",
    ) -> None:
        self._repository = repository
        self._config = config
        self._motion = motion
        self._state = state
        self._lifecycle = lifecycle
        self._obs = observability
        self._runs: dict[str, ProgramRunState] = {}

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """
        Reload persisted runs on Brain startup.
        Any run that was not in a terminal state is marked interrupted —
        we cannot safely resume mid-motion after a restart.
        """
        rows = await self._repository.list_program_runs()
        interrupted = 0
        for row in rows:
            run = ProgramRunState(**row)
            if run.status not in _TERMINAL:
                run = run.model_copy(
                    update={
                        "status": ProgramRunStatus.interrupted,
                        "error": "Brain restarted mid-run",
                    }
                )
                await self._persist_and_publish(run)
                interrupted += 1
            self._runs[run.run_id] = run
        logger.info(
            "ProgramService: loaded {} run(s) ({} interrupted) from storage",
            len(rows),
            interrupted,
        )

    # ── Program CRUD ──────────────────────────────────────────────────────────

    async def save_program(self, program: Program) -> None:
        """Validate and persist a program AST."""
        steps = _flatten_steps(program.root)
        _validate_steps(steps)
        await self._repository.save_program(program.meta.program_id, program.model_dump())
        logger.debug("ProgramService: saved program {}", program.meta.program_id)

    async def load_program(self, program_id: str) -> Program | None:
        row = await self._repository.load_program(program_id)
        if row is None:
            return None
        return Program.model_validate(row)

    async def list_programs(self) -> list[ProgramMeta]:
        rows = await self._repository.list_programs()
        # Repository returns {id, updated_at} — load full meta for name/description
        metas: list[ProgramMeta] = []
        for row in rows:
            prog = await self._repository.load_program(row["id"])
            if prog:
                metas.append(Program.model_validate(prog).meta)
        return metas

    async def delete_program(self, program_id: str) -> None:
        await self._repository.delete_program(program_id)
        logger.info("ProgramService: deleted program {}", program_id)

    # ── Run management ────────────────────────────────────────────────────────

    def get_run(self, run_id: str) -> ProgramRunState | None:
        return self._runs.get(run_id)

    def list_runs(
        self, program_id: str | None = None, *, active_only: bool = False
    ) -> list[ProgramRunState]:
        runs = list(self._runs.values())
        if program_id is not None:
            runs = [r for r in runs if r.program_id == program_id]
        if active_only:
            runs = [r for r in runs if r.status not in _TERMINAL]
        runs.sort(key=lambda r: r.created_at, reverse=True)
        return runs

    async def start_run(self, program_id: str, machine_id: str) -> ProgramRunState:
        """
        Load the program, validate it, then start an async execution task.
        Returns immediately with a ProgramRunState in 'running' status.
        """
        program = await self.load_program(program_id)
        if program is None:
            raise ValueError(f"Program {program_id!r} not found")

        steps = _flatten_steps(program.root)
        _validate_steps(steps)

        run_id = str(uuid.uuid4())
        run = ProgramRunState(
            run_id=run_id,
            program_id=program_id,
            machine_id=machine_id,
            status=ProgramRunStatus.running,
            current_step_index=0,
            total_steps=len(steps),
        )
        self._runs[run_id] = run
        await self._persist_and_publish(run)
        logger.info(
            "ProgramService: started run={} program={} machine={} steps={}",
            run_id, program_id, machine_id, len(steps),
        )
        asyncio.create_task(self._execute(run_id, steps, machine_id))  # noqa: RUF006
        return run

    async def stop_run(self, run_id: str) -> ProgramRunState:
        """Signal the runner to stop. The task exits on its next iteration."""
        run = self._runs.get(run_id)
        if run is None:
            raise ValueError(f"Unknown run {run_id!r}")
        if run.status in _TERMINAL:
            raise ValueError(f"Run {run_id!r} is already in terminal state {run.status!r}")
        _assert_valid_transition(run.status, ProgramRunStatus.stopped)
        run = run.model_copy(update={"status": ProgramRunStatus.stopped})
        self._runs[run_id] = run
        await self._persist_and_publish(run)
        logger.info("ProgramService: stopped run={}", run_id)
        return run

    # ── Execution loop ────────────────────────────────────────────────────────

    async def _execute(
        self, run_id: str, steps: list[ProgramNode], machine_id: str
    ) -> None:
        """Sequential step executor. Runs as a background task."""
        try:
            for i, node in enumerate(steps):
                run = self._runs.get(run_id)
                if run is None or run.status != ProgramRunStatus.running:
                    return  # externally stopped or interrupted

                # Update step pointer
                run = run.model_copy(
                    update={
                        "current_step_index": i,
                        "current_node_id": f"step_{i}_{node.kind}",
                    }
                )
                self._runs[run_id] = run
                await self._persist_and_publish(run)

                if node.kind == NodeKind.MOVE:
                    await self._execute_move(run_id, machine_id, node, i)
                elif node.kind == NodeKind.WAIT:
                    await self._execute_wait(run_id, node)

                # Check again after each step in case stop arrived during execution
                run = self._runs.get(run_id)
                if run is None or run.status != ProgramRunStatus.running:
                    return

            # All steps done — mark completed
            run = self._runs.get(run_id)
            if run is not None and run.status == ProgramRunStatus.running:
                run = run.model_copy(
                    update={
                        "status": ProgramRunStatus.completed,
                        "current_step_index": len(steps),
                    }
                )
                self._runs[run_id] = run
                await self._persist_and_publish(run)
                logger.info("ProgramService: completed run={}", run_id)

        except Exception as exc:
            logger.exception("ProgramService: run={} faulted: {}", run_id, exc)
            run = self._runs.get(run_id)
            if run is not None and run.status not in _TERMINAL:
                run = run.model_copy(
                    update={
                        "status": ProgramRunStatus.faulted,
                        "error": str(exc),
                    }
                )
                self._runs[run_id] = run
                await self._persist_and_publish(run)

    async def _execute_move(
        self, run_id: str, machine_id: str, node: ProgramNode, step_index: int
    ) -> None:
        joint_name: str = node.attributes["joint_name"]
        target_rad: float = float(node.attributes["target_rad"])

        await self._motion.move_joint(machine_id, {joint_name: target_rad})

        # Wait for convergence via state subscription
        loop = asyncio.get_running_loop()
        done: asyncio.Future[None] = loop.create_future()

        def _check(machine_state) -> None:
            if done.done():
                return
            # Only consider state updates from the machine we commanded.
            if machine_state.machine_id != machine_id:
                return
            run = self._runs.get(run_id)
            if run is None or run.status != ProgramRunStatus.running:
                if not done.done():
                    done.set_result(None)
                return
            measured = machine_state.measured if machine_state else []
            for js in measured:
                if js.joint_name == joint_name:
                    if abs(js.angle_rad - target_rad) < _TOLERANCE_RAD:
                        if not done.done():
                            done.set_result(None)
                    break

        self._state.subscribe(_check)

        try:
            await asyncio.wait_for(done, timeout=_STEP_TIMEOUT_S)
        except TimeoutError:
            run = self._runs.get(run_id)
            if run is not None and run.status == ProgramRunStatus.running:
                raise TimeoutError(
                    f"Step {step_index} (MOVE {joint_name}→{target_rad:.3f} rad) "
                    f"did not converge within {_STEP_TIMEOUT_S}s"
                )

    async def _execute_wait(self, run_id: str, node: ProgramNode) -> None:
        duration_s: float = float(node.attributes["duration_s"])
        elapsed = 0.0
        while elapsed < duration_s:
            run = self._runs.get(run_id)
            if run is None or run.status != ProgramRunStatus.running:
                return
            await asyncio.sleep(_WAIT_POLL_S)
            elapsed += _WAIT_POLL_S

    # ── Internals ─────────────────────────────────────────────────────────────

    async def _persist_and_publish(self, run: ProgramRunState) -> None:
        await self._repository.save_program_run(run.run_id, run.model_dump())
        self._obs._publish_event(  # type: ignore[attr-defined]
            {
                "type": "program.run.update",
                "topic": f"programs/runs/{run.run_id}",
                **run.model_dump(),
            }
        )


def _assert_valid_transition(
    current: ProgramRunStatus, target: ProgramRunStatus
) -> None:
    if target not in _VALID_TRANSITIONS.get(current, set()):
        raise ValueError(
            f"Invalid program run transition: {current!r} → {target!r}"
        )

    async def abort_program(self, program_id: str) -> None:
        """Abort a running or paused program."""
        logger.warning("Aborting program %s", program_id)
        self._running.pop(program_id, None)
        # TODO: cancel the interpreter coroutine, trigger motion abort

    def _interpret_node(self, node: ProgramNode, machine_id: str) -> None:
        """Recursively interpret a single AST node. Stub for now."""
        # TODO: dispatch on node.kind to motion/state/lifecycle services
