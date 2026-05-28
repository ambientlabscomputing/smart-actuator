"""
CalibrationService — interactive per-joint calibration job orchestrator (J4).

Each calibration is a named job (job_id) that progresses through a linear
state machine.  The math is stubbed (J4 open question 2 — real routines
land later); the job *pattern* is what this journey builds:

  started → waiting_for_home → running_sweep → completed
                              ↘ aborted / faulted

Jobs persist to SQLite so they survive Brain restarts.  Multiple UI clients
can observe the same job via the ObservabilityService event stream.
"""

import asyncio
import math
import uuid
from typing import TYPE_CHECKING

from brain.models.calibration import CalibrationJobState, CalibrationJobStatus
from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.service.observability_service import ObservabilityService

_TERMINAL = {
    CalibrationJobStatus.completed,
    CalibrationJobStatus.aborted,
    CalibrationJobStatus.faulted,
}

_VALID_TRANSITIONS: dict[CalibrationJobStatus, set[CalibrationJobStatus]] = {
    CalibrationJobStatus.started: {CalibrationJobStatus.waiting_for_home, CalibrationJobStatus.aborted},
    CalibrationJobStatus.waiting_for_home: {CalibrationJobStatus.running_sweep, CalibrationJobStatus.aborted},
    CalibrationJobStatus.running_sweep: {CalibrationJobStatus.completed, CalibrationJobStatus.faulted, CalibrationJobStatus.aborted},
    CalibrationJobStatus.completed: set(),
    CalibrationJobStatus.aborted: set(),
    CalibrationJobStatus.faulted: set(),
}

# Prompts shown to the operator at each step
_PROMPTS: dict[CalibrationJobStatus, str] = {
    CalibrationJobStatus.started: "Calibration started. Click Continue to begin.",
    CalibrationJobStatus.waiting_for_home: "Move the arm to its home position, then click Continue.",
    CalibrationJobStatus.running_sweep: "Performing range sweep\u2026",
    CalibrationJobStatus.completed: "Calibration complete.",
    CalibrationJobStatus.aborted: "Calibration aborted.",
    CalibrationJobStatus.faulted: "Calibration faulted.",
}


class CalibrationService:
    """Per-joint calibration job orchestrator (J4 interactive-job pattern)."""

    def __init__(
        self,
        repository: Repository,
        config: Config,
        *,
        observability: "ObservabilityService",
    ) -> None:
        self._repository = repository
        self._config = config
        self._obs = observability
        self._jobs: dict[str, CalibrationJobState] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Reload all persisted jobs into memory on Brain startup."""
        rows = await self._repository.list_calibration_sessions()
        for row in rows:
            state = CalibrationJobState(**row)
            self._jobs[state.job_id] = state
        logger.info("CalibrationService: loaded {} job(s) from storage", len(rows))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def start_job(self, machine_id: str, joint_index: int) -> CalibrationJobState:
        """
        Create a new calibration job for *joint_index* on *machine_id*.
        Raises ValueError if a non-terminal job already exists for that joint.
        """
        for job in self._jobs.values():
            if (
                job.machine_id == machine_id
                and job.joint_index == joint_index
                and job.status not in _TERMINAL
            ):
                raise ValueError(
                    f"Active calibration job {job.job_id!r} already exists for "
                    f"machine {machine_id!r} joint {joint_index}"
                )

        job_id = str(uuid.uuid4())
        state = CalibrationJobState(
            job_id=job_id,
            machine_id=machine_id,
            joint_index=joint_index,
            status=CalibrationJobStatus.started,
            step=0,
            prompt=_PROMPTS[CalibrationJobStatus.started],
        )
        self._jobs[job_id] = state
        await self._persist_and_publish(state)
        logger.info(
            "CalibrationService: started job={} machine={} joint={}",
            job_id, machine_id, joint_index,
        )
        return state

    def get_job(self, job_id: str) -> CalibrationJobState | None:
        return self._jobs.get(job_id)

    def list_jobs(self, machine_id: str | None = None) -> list[CalibrationJobState]:
        jobs = list(self._jobs.values())
        if machine_id is not None:
            jobs = [j for j in jobs if j.machine_id == machine_id]
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs

    async def advance_job(self, job_id: str) -> CalibrationJobState:
        """
        Advance the job to its next logical state.
        The step sequence is:
          started → waiting_for_home  (prompt: move to home)
          waiting_for_home → running_sweep (begin sweep)
          running_sweep → completed (stub result returned immediately)
        Raises ValueError on unknown job or illegal transition.
        """
        state = self._jobs.get(job_id)
        if state is None:
            raise ValueError(f"Unknown calibration job {job_id!r}")
        if state.status in _TERMINAL:
            raise ValueError(
                f"Job {job_id!r} is in terminal state {state.status!r} and cannot be advanced"
            )

        current = state.status

        if current == CalibrationJobStatus.started:
            next_status = CalibrationJobStatus.waiting_for_home
            extra: dict = {}
        elif current == CalibrationJobStatus.waiting_for_home:
            next_status = CalibrationJobStatus.running_sweep
            extra = {}
        elif current == CalibrationJobStatus.running_sweep:
            next_status = CalibrationJobStatus.completed
            # Stub calibration result — real math lands post-J4
            extra = {
                "result": {
                    "offset_rad": 0.0,
                    "gain": 1.0,
                    "range": [-math.pi, math.pi],
                },
                "last_measurement": {"raw_min": -math.pi, "raw_max": math.pi},
            }
        else:
            raise ValueError(
                f"No advance path from state {current!r}"
            )

        self._assert_valid_transition(current, next_status)
        state = state.model_copy(
            update={
                "status": next_status,
                "step": state.step + 1,
                "prompt": _PROMPTS[next_status],
                **extra,
            }
        )
        self._jobs[job_id] = state

        # If the sweep just kicked off, complete it immediately in the background
        # (the stub finishes synchronously above, but we keep the async form
        # for the day real hardware sweeps run here)
        if next_status == CalibrationJobStatus.running_sweep:
            asyncio.create_task(self._complete_sweep(job_id))  # noqa: RUF006

        await self._persist_and_publish(state)
        return state

    async def abort_job(self, job_id: str) -> CalibrationJobState:
        """Transition the job to aborted. Raises ValueError if already terminal."""
        state = self._jobs.get(job_id)
        if state is None:
            raise ValueError(f"Unknown calibration job {job_id!r}")
        if state.status in _TERMINAL:
            raise ValueError(
                f"Job {job_id!r} is already in terminal state {state.status!r}"
            )
        self._assert_valid_transition(state.status, CalibrationJobStatus.aborted)
        state = state.model_copy(
            update={
                "status": CalibrationJobStatus.aborted,
                "prompt": _PROMPTS[CalibrationJobStatus.aborted],
            }
        )
        self._jobs[job_id] = state
        await self._persist_and_publish(state)
        logger.info("CalibrationService: aborted job={}", job_id)
        return state

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _complete_sweep(self, job_id: str) -> None:
        """
        Stub sweep: wait one tick so the caller can return the running_sweep
        state first, then immediately complete.  Replace with real hardware
        sweep logic post-J4.
        """
        await asyncio.sleep(0)
        state = self._jobs.get(job_id)
        if state is None or state.status != CalibrationJobStatus.running_sweep:
            return
        state = state.model_copy(
            update={
                "status": CalibrationJobStatus.completed,
                "step": state.step + 1,
                "prompt": _PROMPTS[CalibrationJobStatus.completed],
                "result": {"offset_rad": 0.0, "gain": 1.0, "range": [-math.pi, math.pi]},
                "last_measurement": {"raw_min": -math.pi, "raw_max": math.pi},
            }
        )
        self._jobs[job_id] = state
        await self._persist_and_publish(state)
        logger.info("CalibrationService: completed job={}", job_id)

    async def _persist_and_publish(self, state: CalibrationJobState) -> None:
        await self._repository.save_calibration_session(state.job_id, state.model_dump())
        self._obs._publish_event(  # type: ignore[attr-defined]
            {
                "type": "calibration.update",
                "topic": f"calibrations/{state.job_id}",
                **state.model_dump(),
            }
        )

    @staticmethod
    def _assert_valid_transition(
        current: CalibrationJobStatus, target: CalibrationJobStatus
    ) -> None:
        if target not in _VALID_TRANSITIONS.get(current, set()):
            raise ValueError(
                f"Invalid calibration state transition: {current!r} → {target!r}"
            )
