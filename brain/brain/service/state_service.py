from collections import deque
from collections.abc import Callable

from brain.models.state import JointState, MachineState
from brain.repository.repository import Repository
from brain.service.kinematics_service import KinematicsService
from brain.service.sidecar_bridge import SidecarBridge
from brain.utils.config import Config
from brain.utils.logger import logger

_STATE_BUFFER_SECONDS = 30
_STATE_BUFFER_MAX = 1000


class StateService:
    """
    Subscribes to the sidecar's aggregated joint-state stream and maintains
    two explicit views of machine state (C5):

    - **Measured** — the raw stream from the sidecar (what actuators report).
    - **Modeled** — the Brain's forward-kinematic view (FK only, not MuJoCo).

    Each public API endpoint declares which view it serves.
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
        self._states: dict[str, MachineState] = {}
        self._buffer: dict[str, deque[MachineState]] = {}
        self._subscribers: list[Callable[[MachineState], None]] = []

    async def start(self) -> None:
        """Begin consuming the sidecar joint-state stream."""
        await self._sidecar.subscribe_joint_states(self._on_joint_states)

    def _on_joint_states(self, raw: list[JointState], machine_id: str) -> None:
        """Internal callback invoked for each sidecar joint-state batch."""
        state = self._states.get(machine_id)
        if state is None:
            state = MachineState(machine_id=machine_id)
        state.measured = raw
        state.modeled = self._kinematics.forward_kinematics(machine_id, raw)
        self._states[machine_id] = state

        buf = self._buffer.setdefault(machine_id, deque(maxlen=_STATE_BUFFER_MAX))
        buf.append(state)

        for cb in self._subscribers:
            try:
                cb(state)
            except Exception:
                logger.exception("State subscriber raised an exception")

    def get_measured_state(self, machine_id: str) -> MachineState | None:
        """Return the latest raw joint states from the sidecar."""
        return self._states.get(machine_id)

    def get_modeled_state(self, machine_id: str) -> MachineState | None:
        """Return the latest FK-computed link poses."""
        return self._states.get(machine_id)

    def subscribe(self, callback: Callable[[MachineState], None]) -> None:
        """Register a callback to be called on every state update."""
        self._subscribers.append(callback)

    def get_state_buffer(self, machine_id: str, max_count: int = 100) -> list[MachineState]:
        """Return the most recent *max_count* state snapshots for replay / debugging."""
        buf = self._buffer.get(machine_id, deque())
        items = list(buf)
        return items[-max_count:]
