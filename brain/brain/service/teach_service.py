"""
TeachService — record-and-replay teach session orchestrator (RFD-13).

Each session owns a recording for one machine.  The state machine is:

  idle → armed → recording → saved
                           ↘ aborted
  Any non-terminal → aborted

On Brain restart, any non-terminal session is marked aborted so that
the UI shows the correct final state (waypoints are preserved and the
aborted session can still be saved into a Program).

When saved, the waypoints are materialised as a Program whose root is a
SEQUENCE of MOVE nodes (one node per joint per waypoint), which the
existing J5 runner replays unchanged.
"""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from brain.models.program import NodeKind, Program, ProgramMeta, ProgramNode
from brain.models.teach import TeachMode, TeachSessionState, TeachStatus, Waypoint
from brain.repository.repository import Repository
from brain.service.dh_fk import ee_transform
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.service.observability_service import ObservabilityService
    from brain.service.program_service import ProgramService
    from brain.service.state_service import StateService

# ─── Constants ────────────────────────────────────────────────────────────────

_TERMINAL: set[TeachStatus] = {TeachStatus.saved, TeachStatus.aborted}

_VALID_TRANSITIONS: dict[TeachStatus, set[TeachStatus]] = {
    TeachStatus.idle: {TeachStatus.armed, TeachStatus.aborted},
    TeachStatus.armed: {TeachStatus.recording, TeachStatus.aborted},
    TeachStatus.recording: {TeachStatus.armed, TeachStatus.saved, TeachStatus.aborted},
    TeachStatus.saved: set(),
    TeachStatus.aborted: set(),
}


class TeachService:
    """Per-machine teach session orchestrator (RFD-13)."""

    def __init__(
        self,
        repository: Repository,
        config: Config,
        *,
        state: "StateService",
        programs: "ProgramService",
        observability: "ObservabilityService",
    ) -> None:
        self._repository = repository
        self._config = config
        self._state = state
        self._programs = programs
        self._obs = observability
        # machine_id → active session
        self._sessions: dict[str, TeachSessionState] = {}

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """
        Reload persisted sessions on Brain startup.
        Non-terminal sessions are aborted (their waypoints are preserved).
        """
        rows = await self._repository.teach.list_sessions()
        recovered = 0
        for session in rows:
            if session.status not in _TERMINAL:
                session = session.model_copy(
                    update={
                        "status": TeachStatus.aborted,
                        "error": "Brain restarted mid-session",
                        "updated_at": datetime.now(UTC),
                    }
                )
                await self._persist_and_publish(session)
                recovered += 1
            self._sessions[session.machine_id] = session
        logger.info(
            "TeachService: loaded {} session(s) ({} recovered) from storage",
            len(rows),
            recovered,
        )

    # ── Public API ────────────────────────────────────────────────────────────

    async def start_session(
        self, machine_id: str, mode: TeachMode, *, created_by: str
    ) -> TeachSessionState:
        """
        Create a new teach session for *machine_id*.
        Raises ValueError if a non-terminal session is already active.
        """
        existing = self._sessions.get(machine_id)
        if existing is not None and existing.status not in _TERMINAL:
            raise ValueError(
                f"Active teach session {existing.session_id!r} already exists for "
                f"machine {machine_id!r} (status={existing.status!r}). "
                "Abort it first."
            )

        session_id = str(uuid.uuid4())
        now = datetime.now(UTC)
        session = TeachSessionState(
            session_id=session_id,
            machine_id=machine_id,
            mode=mode,
            status=TeachStatus.armed,
            waypoints=[],
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        self._sessions[machine_id] = session
        await self._persist_and_publish(session)
        logger.info(
            "TeachService: started session={} machine={} mode={}",
            session_id,
            machine_id,
            mode,
        )
        return session

    def get_session(self, machine_id: str) -> TeachSessionState | None:
        return self._sessions.get(machine_id)

    def get_session_by_id(self, session_id: str) -> TeachSessionState | None:
        for s in self._sessions.values():
            if s.session_id == session_id:
                return s
        return None

    async def start_recording(self, session_id: str, *, created_by: str) -> TeachSessionState:
        """Transition from armed → recording (arm is ready, user hits Record)."""
        session = self._require_session(session_id)
        self._assert_valid_transition(session.status, TeachStatus.recording)
        session = session.model_copy(
            update={"status": TeachStatus.recording, "updated_at": datetime.now(UTC)}
        )
        self._sessions[session.machine_id] = session
        await self._persist_and_publish(session)
        return session

    async def capture(self, session_id: str, *, created_by: str) -> TeachSessionState:
        """
        Snapshot the current joint state and append it as a Waypoint.
        Can be called while recording or armed.

        Also runs FK against the machine's DH chain (and EE offset) so the
        waypoint carries an SE(3) pose. When saved as a program the waypoint
        replays as a MOVE_SE3 node (IK-resolved at run time) rather than
        verbatim joint targets — this is more robust to small calibration
        drift and lets the same program run on geometrically similar arms.
        """
        session = self._require_session(session_id)
        if session.status not in (TeachStatus.recording, TeachStatus.armed):
            raise ValueError(
                f"Cannot capture in state {session.status!r}; session must be recording or armed."
            )

        machine_state = self._state.get_measured_state(session.machine_id)
        if machine_state is None or not machine_state.measured:
            raise ValueError(
                f"No joint state available for machine {session.machine_id!r}. "
                "Ensure the machine is connected and streaming."
            )

        joint_positions = {js.joint_name: js.position for js in machine_state.measured}

        # Compute EE pose via FK (pose is optional; fall back to joint replay
        # when the machine has no DH chain configured).
        position: list[float] | None = None
        orientation_quat: list[float] | None = None
        machine = await self._repository.machine.load_machine(session.machine_id)
        if machine is not None and machine.description.dh_chain is not None:
            dh = machine.description.dh_chain
            angles_rad = [joint_positions.get(j.name, 0.0) for j in dh.joints]
            T = ee_transform(dh, angles_rad, machine.description.end_effector)
            position = [T[3], T[7], T[11]]
            orientation_quat = list(_matrix_to_quat(T))

        waypoint = Waypoint(
            joint_positions=joint_positions,
            position=position,
            orientation_quat=orientation_quat,
        )
        new_waypoints = [*session.waypoints, waypoint]
        session = session.model_copy(
            update={"waypoints": new_waypoints, "updated_at": datetime.now(UTC)}
        )
        self._sessions[session.machine_id] = session
        await self._persist_and_publish(session)
        logger.debug(
            "TeachService: captured waypoint {} for session={} (pose={})",
            len(new_waypoints),
            session_id,
            "se3" if position is not None else "joints-only",
        )
        return session

    async def delete_waypoint(
        self, session_id: str, index: int, *, created_by: str
    ) -> TeachSessionState:
        """Remove waypoint at *index* (0-based)."""
        session = self._require_session(session_id)
        if session.status in _TERMINAL:
            raise ValueError(
                f"Session {session_id!r} is {session.status!r}; waypoints cannot be modified."
            )
        waypoints = list(session.waypoints)
        if index < 0 or index >= len(waypoints):
            raise ValueError(
                f"Waypoint index {index} out of range (session has {len(waypoints)} waypoints)."
            )
        waypoints.pop(index)
        session = session.model_copy(
            update={"waypoints": waypoints, "updated_at": datetime.now(UTC)}
        )
        self._sessions[session.machine_id] = session
        await self._persist_and_publish(session)
        return session

    async def abort(self, session_id: str, *, created_by: str) -> TeachSessionState:
        """Abort the session.  Raises ValueError if already terminal."""
        session = self._require_session(session_id)
        if session.status in _TERMINAL:
            raise ValueError(
                f"Session {session_id!r} is already in terminal state {session.status!r}."
            )
        session = session.model_copy(
            update={
                "status": TeachStatus.aborted,
                "error": "Aborted by user",
                "updated_at": datetime.now(UTC),
            }
        )
        self._sessions[session.machine_id] = session
        await self._persist_and_publish(session)
        logger.info("TeachService: aborted session={}", session_id)
        return session

    async def save(
        self, session_id: str, name: str, *, created_by: str
    ) -> tuple[TeachSessionState, str]:
        """
        Materialise waypoints as a Program and persist it.

        Returns (updated_session, program_id).
        Raises ValueError if there are no waypoints or the session is terminal.
        """
        session = self._require_session(session_id)
        if session.status in _TERMINAL and session.status != TeachStatus.aborted:
            raise ValueError(
                f"Session {session_id!r} is already in terminal state {session.status!r}."
            )
        if not session.waypoints:
            raise ValueError("No waypoints captured; nothing to save.")

        program = _waypoints_to_program(
            waypoints=session.waypoints,
            machine_id=session.machine_id,
            name=name,
        )
        await self._programs.save_program(program, created_by=created_by)

        session = session.model_copy(
            update={
                "status": TeachStatus.saved,
                "program_id": program.meta.program_id,
                "updated_at": datetime.now(UTC),
            }
        )
        self._sessions[session.machine_id] = session
        await self._persist_and_publish(session)
        logger.info(
            "TeachService: saved session={} → program={}",
            session_id,
            program.meta.program_id,
        )
        return session, program.meta.program_id

    # ── Internal ──────────────────────────────────────────────────────────────

    def _require_session(self, session_id: str) -> TeachSessionState:
        session = self.get_session_by_id(session_id)
        if session is None:
            raise ValueError(f"Unknown teach session {session_id!r}.")
        return session

    async def _persist_and_publish(self, session: TeachSessionState) -> None:
        data = session.model_dump(mode="json")
        await self._repository.teach.save_session(
            session.session_id, data, created_by=session.created_by or "system"
        )
        self._obs._publish_event(  # type: ignore[attr-defined]
            {
                "type": "teach.update",
                "topic": f"teach/{session.session_id}",
                **data,
            }
        )

    @staticmethod
    def _assert_valid_transition(current: TeachStatus, target: TeachStatus) -> None:
        if target not in _VALID_TRANSITIONS.get(current, set()):
            raise ValueError(
                f"Invalid teach session state transition: {current!r} → {target!r}"
            )


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _matrix_to_quat(T: list[float]) -> tuple[float, float, float, float]:
    """
    Extract (qx, qy, qz, qw) from a row-major 4x4 homogeneous transform.

    Uses the standard branch-by-largest-diagonal-element algorithm for
    numerical stability across the full SO(3) range.
    """
    # Row-major: T[row*4 + col]
    m00, m01, m02 = T[0], T[1], T[2]
    m10, m11, m12 = T[4], T[5], T[6]
    m20, m21, m22 = T[8], T[9], T[10]
    trace = m00 + m11 + m22
    if trace > 0:
        s = 0.5 / math.sqrt(trace + 1.0)
        qw = 0.25 / s
        qx = (m21 - m12) * s
        qy = (m02 - m20) * s
        qz = (m10 - m01) * s
    elif m00 > m11 and m00 > m22:
        s = 2.0 * math.sqrt(1.0 + m00 - m11 - m22)
        qw = (m21 - m12) / s
        qx = 0.25 * s
        qy = (m01 + m10) / s
        qz = (m02 + m20) / s
    elif m11 > m22:
        s = 2.0 * math.sqrt(1.0 + m11 - m00 - m22)
        qw = (m02 - m20) / s
        qx = (m01 + m10) / s
        qy = 0.25 * s
        qz = (m12 + m21) / s
    else:
        s = 2.0 * math.sqrt(1.0 + m22 - m00 - m11)
        qw = (m10 - m01) / s
        qx = (m02 + m20) / s
        qy = (m12 + m21) / s
        qz = 0.25 * s
    return (qx, qy, qz, qw)


def _waypoints_to_program(
    waypoints: list[Waypoint], machine_id: str, name: str
) -> Program:
    """
    Convert a list of Waypoints into a Program AST.

    When a waypoint has an SE(3) pose attached (position + orientation_quat),
    it becomes a single MOVE_SE3 node — the runtime then solves IK against
    the live machine state, which is more robust than replaying joint angles
    verbatim. Waypoints captured against a machine without a DH chain fall
    back to a sub-sequence of MOVE nodes (one per joint).
    """
    steps: list[ProgramNode] = []
    for waypoint in waypoints:
        if waypoint.position is not None and waypoint.orientation_quat is not None:
            steps.append(
                ProgramNode(
                    kind=NodeKind.MOVE_SE3,
                    attributes={
                        "position": list(waypoint.position),
                        "orientation_quat": list(waypoint.orientation_quat),
                    },
                )
            )
        else:
            for joint_name, position in waypoint.joint_positions.items():
                steps.append(
                    ProgramNode(
                        kind=NodeKind.MOVE,
                        attributes={"joint_name": joint_name, "target": position},
                    )
                )

    program_id = str(uuid.uuid4())
    return Program(
        meta=ProgramMeta(program_id=program_id, name=name),
        machine_id=machine_id,
        root=ProgramNode(kind=NodeKind.SEQUENCE, children=steps),
    )
