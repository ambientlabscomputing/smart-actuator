import aiosqlite


class SimRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def save_sim(
        self,
        machine_id: str,
        slot: int,
        *,
        address: str,
        pid: int,
        actuator_id: str,
        joint_name: str,
    ) -> None:
        await self._conn.execute(
            """
            INSERT INTO sim_registry (machine_id, slot, address, pid, actuator_id, joint_name)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(machine_id, slot) DO UPDATE SET
                address     = excluded.address,
                pid         = excluded.pid,
                actuator_id = excluded.actuator_id,
                joint_name  = excluded.joint_name,
                spawned_at  = strftime('%s','now')
            """,
            (machine_id, slot, address, pid, actuator_id, joint_name),
        )
        await self._conn.commit()

    async def delete_sim(self, machine_id: str, slot: int) -> None:
        await self._conn.execute(
            "DELETE FROM sim_registry WHERE machine_id = ? AND slot = ?",
            (machine_id, slot),
        )
        await self._conn.commit()

    async def delete_all_sims(self, machine_id: str) -> None:
        await self._conn.execute(
            "DELETE FROM sim_registry WHERE machine_id = ?", (machine_id,)
        )
        await self._conn.commit()

    async def list_sims(self, machine_id: str) -> list[dict]:
        """Return all sim_registry rows for a machine, ordered by slot."""
        async with self._conn.execute(
            """
            SELECT slot, address, pid, actuator_id, joint_name
            FROM sim_registry
            WHERE machine_id = ?
            ORDER BY slot
            """,
            (machine_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [
            {
                "slot": row[0],
                "address": row[1],
                "pid": row[2],
                "actuator_id": row[3],
                "joint_name": row[4],
            }
            for row in rows
        ]

    async def list_all_sims(self) -> list[dict]:
        """Return all sim_registry rows across all machines, ordered by machine then slot."""
        async with self._conn.execute(
            """
            SELECT machine_id, slot, address, pid, actuator_id, joint_name
            FROM sim_registry
            ORDER BY machine_id, slot
            """
        ) as cur:
            rows = await cur.fetchall()
        return [
            {
                "machine_id": row[0],
                "slot": row[1],
                "address": row[2],
                "pid": row[3],
                "actuator_id": row[4],
                "joint_name": row[5],
            }
            for row in rows
        ]
