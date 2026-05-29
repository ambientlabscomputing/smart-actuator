import json

import aiosqlite


class MachineRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def save_machine(self, machine_id: str, data: dict) -> None:
        description_json = json.dumps(data.get("description", data))
        expanded_urdf = data.get("expanded_urdf", "")
        await self._conn.execute(
            """
            INSERT INTO machines (id, description_json, expanded_urdf)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                description_json = excluded.description_json,
                expanded_urdf    = excluded.expanded_urdf
            """,
            (machine_id, description_json, expanded_urdf),
        )
        await self._conn.commit()

    async def load_machine(self, machine_id: str) -> dict | None:
        async with self._conn.execute(
            "SELECT description_json, expanded_urdf FROM machines WHERE id = ?",
            (machine_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        description = json.loads(row[0])
        return {"description": description, "expanded_urdf": row[1]}

    async def list_machines(self) -> list[str]:
        async with self._conn.execute("SELECT id FROM machines ORDER BY created_at") as cur:
            rows = await cur.fetchall()
        return [row[0] for row in rows]

    async def delete_machine(self, machine_id: str) -> None:
        await self._conn.execute("DELETE FROM machines WHERE id = ?", (machine_id,))
        await self._conn.commit()
