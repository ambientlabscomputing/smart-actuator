import json

import aiosqlite


class ModeEventRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def append_mode_event(self, event: dict) -> None:
        machine_id = event.get("machine_id", "")
        await self._conn.execute(
            "INSERT INTO mode_events (machine_id, event_json) VALUES (?, ?)",
            (machine_id, json.dumps(event)),
        )
        await self._conn.commit()

    async def get_mode_events(self, machine_id: str, limit: int = 100) -> list[dict]:
        async with self._conn.execute(
            """
            SELECT event_json FROM mode_events
            WHERE machine_id = ?
            ORDER BY recorded_at DESC
            LIMIT ?
            """,
            (machine_id, limit),
        ) as cur:
            rows = await cur.fetchall()
        return [json.loads(row[0]) for row in rows]
