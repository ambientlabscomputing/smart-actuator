from collections.abc import Callable

from brain.models.state import MachineMode, ModeEvent
from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger

_VALID_TRANSITIONS: dict[MachineMode, set[MachineMode]] = {
    MachineMode.OFFLINE:  {MachineMode.IDLE},
    MachineMode.IDLE:     {MachineMode.OFFLINE, MachineMode.MANUAL, MachineMode.RUN, MachineMode.FAULT, MachineMode.ESTOPPED},
    MachineMode.MANUAL:   {MachineMode.IDLE, MachineMode.FAULT, MachineMode.ESTOPPED},
    MachineMode.RUN:      {MachineMode.IDLE, MachineMode.FAULT, MachineMode.ESTOPPED},
    MachineMode.FAULT:    {MachineMode.IDLE, MachineMode.ESTOPPED},
    MachineMode.ESTOPPED: {MachineMode.IDLE},
}


class LifecycleService:
    """
    Manages the machine operating-mode state machine (C7).

    Modes: OFFLINE → IDLE ↔ MANUAL / RUN → FAULT → IDLE
    Mode transitions are first-class events observable by all interfaces.
    """

    def __init__(self, repository: Repository, config: Config) -> None:
        self._repository = repository
        self._config = config
        self._modes: dict[str, MachineMode] = {}
        self._subscribers: list[Callable[[ModeEvent], None]] = []

    def get_mode(self, machine_id: str) -> MachineMode:
        """Return the current operating mode for a machine."""
        return self._modes.get(machine_id, MachineMode.OFFLINE)

    async def request_mode(self, machine_id: str, target: MachineMode, reason: str = "") -> None:
        """
        Attempt a mode transition.
        Raises ValueError if the transition is not permitted from the current mode.
        """
        current = self.get_mode(machine_id)
        allowed = _VALID_TRANSITIONS.get(current, set())
        if target not in allowed:
            raise ValueError(f"Cannot transition machine {machine_id!r} from {current} to {target}")
        logger.info(
            "Machine %s: %s → %s (%s)", machine_id, current, target, reason or "no reason given"
        )
        self._modes[machine_id] = target
        event = ModeEvent(
            machine_id=machine_id,
            previous_mode=current,
            new_mode=target,
            reason=reason,
        )
        # TODO: persist event to repository
        for cb in self._subscribers:
            try:
                cb(event)
            except Exception:
                logger.exception("Mode-event subscriber raised an exception")

    async def get_mode_history(self, machine_id: str) -> list[ModeEvent]:
        """Return persisted mode-change events for a machine (most recent last)."""
        # TODO: query repository mode_events table
        return []

    def subscribe_mode_changes(self, callback: Callable[[ModeEvent], None]) -> None:
        """Register a callback invoked on every mode transition."""
        self._subscribers.append(callback)
