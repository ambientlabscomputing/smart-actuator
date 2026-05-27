import json

import aiosqlite

from brain.utils.logger import logger

_SCHEMA = """
CREATE TABLE IF NOT EXISTS machines (
    id              TEXT PRIMARY KEY,
    description_json TEXT NOT NULL,
    expanded_urdf   TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sim_registry (
    machine_id  TEXT NOT NULL,
    slot        INTEGER NOT NULL,
    address     TEXT NOT NULL,
    pid         INTEGER NOT NULL,
    actuator_id TEXT NOT NULL,
    joint_name  TEXT NOT NULL DEFAULT '',
    spawned_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (machine_id, slot)
);

CREATE TABLE IF NOT EXISTS calibrations (
    machine_id  TEXT NOT NULL,
    data_json   TEXT NOT NULL,
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (machine_id)
);

CREATE TABLE IF NOT EXISTS programs (
    id          TEXT PRIMARY KEY,
    data_json   TEXT NOT NULL,
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS mode_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id  TEXT NOT NULL,
    event_json  TEXT NOT NULL,
    recorded_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
"""


class Repository:
    """
    SQLite-backed persistence layer.

    Owns a single database file (brain.db by default).  All mutable Brain
    state that must survive restarts lives here:
      - machine descriptions (template_ref + parameters + actuator_bindings)
      - sim_registry (spawned sim PIDs and addresses)
      - calibration data per machine
      - program library
      - mode-event history

    The expanded URDF is stored alongside the description for J6/J7 use;
    the description tuple is the source of truth.
    """

    def __init__(self, db_path: str = "brain.db") -> None:
        self._db_path = db_path
        self._db: aiosqlite.Connection | None = None

    async def start(self) -> None:
        """Open the database and run migrations."""
        self._db = await aiosqlite.connect(self._db_path)
        await self._db.executescript(_SCHEMA)
        await self._db.commit()
        logger.info("Repository opened at {}", self._db_path)

    async def stop(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    @property
    def _conn(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError("Repository not started — call start() first")
        return self._db

    # ------------------------------------------------------------------
    # Machine descriptions
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Sim registry
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Calibration data
    # ------------------------------------------------------------------

    async def save_calibration(self, machine_id: str, data: dict) -> None:
        await self._conn.execute(
            """
            INSERT INTO calibrations (machine_id, data_json)
            VALUES (?, ?)
            ON CONFLICT(machine_id) DO UPDATE SET
                data_json  = excluded.data_json,
                updated_at = strftime('%s','now')
            """,
            (machine_id, json.dumps(data)),
        )
        await self._conn.commit()

    async def load_calibration(self, machine_id: str) -> dict | None:
        async with self._conn.execute(
            "SELECT data_json FROM calibrations WHERE machine_id = ?", (machine_id,)
        ) as cur:
            row = await cur.fetchone()
        return json.loads(row[0]) if row else None

    # ------------------------------------------------------------------
    # Program library
    # ------------------------------------------------------------------

    async def save_program(self, program_id: str, data: dict) -> None:
        await self._conn.execute(
            """
            INSERT INTO programs (id, data_json)
            VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET
                data_json  = excluded.data_json,
                updated_at = strftime('%s','now')
            """,
            (program_id, json.dumps(data)),
        )
        await self._conn.commit()

    async def load_program(self, program_id: str) -> dict | None:
        async with self._conn.execute(
            "SELECT data_json FROM programs WHERE id = ?", (program_id,)
        ) as cur:
            row = await cur.fetchone()
        return json.loads(row[0]) if row else None

    async def list_programs(self) -> list[dict]:
        async with self._conn.execute(
            "SELECT id, updated_at FROM programs ORDER BY updated_at DESC"
        ) as cur:
            rows = await cur.fetchall()
        return [{"id": row[0], "updated_at": row[1]} for row in rows]

    async def delete_program(self, program_id: str) -> None:
        await self._conn.execute("DELETE FROM programs WHERE id = ?", (program_id,))
        await self._conn.commit()

    # ------------------------------------------------------------------
    # Mode event history
    # ------------------------------------------------------------------

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

