import asyncio
from collections import deque
from collections.abc import AsyncIterator
from typing import Any

from brain.utils.config import Config
from brain.utils.logger import logger

_EVENT_BUFFER_MAX = 500


class ObservabilityService:
    """
    Structured logging, metrics, and event streaming (C10).

    Produces structured log entries for every command accepted, refused, or
    faulted; tracks coarse operational metrics; and maintains an event buffer
    that UI WebSocket connections can tail.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._event_buffer: deque[dict[str, Any]] = deque(maxlen=_EVENT_BUFFER_MAX)
        self._event_queues: list[asyncio.Queue[dict[str, Any]]] = []
        self._metrics: dict[str, Any] = {
            "commands_accepted": 0,
            "commands_refused": 0,
            "faults": 0,
        }

    def log_command(
        self,
        command: str,
        accepted: bool,
        machine_id: str = "",
        reason: str | None = None,
    ) -> None:
        """Emit a structured log line for a command and update counters."""
        if accepted:
            self._metrics["commands_accepted"] += 1
            logger.info("ACCEPTED command=%s machine=%s", command, machine_id)
        else:
            self._metrics["commands_refused"] += 1
            logger.warning("REFUSED command=%s machine=%s reason=%s", command, machine_id, reason)
        event = {
            "type": "command",
            "command": command,
            "accepted": accepted,
            "machine_id": machine_id,
            "reason": reason,
        }
        self._publish_event(event)

    def log_fault(self, machine_id: str, description: str) -> None:
        """Record a fault event."""
        self._metrics["faults"] += 1
        logger.error("FAULT machine=%s description=%s", machine_id, description)
        self._publish_event({"type": "fault", "machine_id": machine_id, "description": description})

    def get_metrics(self) -> dict[str, Any]:
        """Return a snapshot of the current operational metrics."""
        return dict(self._metrics)

    async def event_stream(self) -> AsyncIterator[dict[str, Any]]:
        """
        Async generator that yields events as they arrive.
        Each active WebSocket / SSE client holds one of these.
        """
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._event_queues.append(q)
        try:
            while True:
                event = await q.get()
                yield event
        finally:
            self._event_queues.remove(q)

    def _publish_event(self, event: dict[str, Any]) -> None:
        self._event_buffer.append(event)
        for q in self._event_queues:
            q.put_nowait(event)
