import aiosqlite


class HardwareRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def save_hardware(
        self,
        machine_id: str,
        slot: int,
        *,
        address: str,
        actuator_id: str,
        joint_name: str,
    ) -> None:
        await self._conn.execute(
            """
            INSERT INTO hardware_registry (machine_id, slot, address, actuator_id, joint_name)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(machine_id, slot) DO UPDATE SET
                address     = excluded.address,
                actuator_id = excluded.actuator_id,
                joint_name  = excluded.joint_name,
                bound_at    = strftime('%s','now')
            """,
            (machine_id, slot, address, actuator_id, joint_name),
        )
        await self._conn.commit()

    async def delete_hardware(self, machine_id: str, slot: int) -> None:
        await self._conn.execute(
            "DELETE FROM hardware_registry WHERE machine_id = ? AND slot = ?",
            (machine_id, slot),
        )
        await self._conn.commit()

    async def delete_all_hardware(self, machine_id: str) -> None:
        await self._conn.execute(
            "DELETE FROM hardware_registry WHERE machine_id = ?", (machine_id,)
        )
        await self._conn.commit()

    async def list_hardware(self, machine_id: str) -> list[dict]:
        async with self._conn.execute(
            """
            SELECT slot, address, actuator_id, joint_name
            FROM hardware_registry
            WHERE machine_id = ?
            ORDER BY slot
            """,
            (machine_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [
            {"slot": r[0], "address": r[1], "actuator_id": r[2], "joint_name": r[3]}
            for r in rows
        ]

    async def list_all_hardware(self) -> list[dict]:
        async with self._conn.execute(
            """
            SELECT machine_id, slot, address, actuator_id, joint_name
            FROM hardware_registry
            ORDER BY machine_id, slot
            """
        ) as cur:
            rows = await cur.fetchall()
        return [
            {
                "machine_id": r[0],
                "slot": r[1],
                "address": r[2],
                "actuator_id": r[3],
                "joint_name": r[4],
            }
            for r in rows
        ]
