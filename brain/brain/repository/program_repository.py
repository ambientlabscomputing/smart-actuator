import json

import aiosqlite


class ProgramRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

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
    # Program runs
    # ------------------------------------------------------------------

    async def save_program_run(self, run_id: str, data: dict) -> None:
        await self._conn.execute(
            """
            INSERT INTO program_runs
                (run_id, program_id, machine_id, status,
                 current_step_index, total_steps, current_node_id, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                status              = excluded.status,
                current_step_index  = excluded.current_step_index,
                total_steps         = excluded.total_steps,
                current_node_id     = excluded.current_node_id,
                error               = excluded.error,
                updated_at          = strftime('%s','now')
            """,
            (
                run_id,
                data["program_id"],
                data["machine_id"],
                data["status"],
                data.get("current_step_index", 0),
                data.get("total_steps", 0),
                data.get("current_node_id", ""),
                data.get("error", ""),
            ),
        )
        await self._conn.commit()

    async def load_program_run(self, run_id: str) -> dict | None:
        async with self._conn.execute(
            """
            SELECT run_id, program_id, machine_id, status,
                   current_step_index, total_steps, current_node_id,
                   error, created_at, updated_at
            FROM program_runs WHERE run_id = ?
            """,
            (run_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        return {
            "run_id": row[0],
            "program_id": row[1],
            "machine_id": row[2],
            "status": row[3],
            "current_step_index": row[4],
            "total_steps": row[5],
            "current_node_id": row[6],
            "error": row[7],
            "created_at": row[8],
            "updated_at": row[9],
        }

    async def list_program_runs(
        self,
        program_id: str | None = None,
        *,
        active_only: bool = False,
    ) -> list[dict]:
        _TERMINAL = ("completed", "stopped", "faulted", "interrupted")
        conditions: list[str] = []
        params: list[str] = []
        if program_id is not None:
            conditions.append("program_id = ?")
            params.append(program_id)
        if active_only:
            placeholders = ",".join("?" * len(_TERMINAL))
            conditions.append(f"status NOT IN ({placeholders})")
            params.extend(_TERMINAL)
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        async with self._conn.execute(
            f"""
            SELECT run_id, program_id, machine_id, status,
                   current_step_index, total_steps, current_node_id,
                   error, created_at, updated_at
            FROM program_runs {where}
            ORDER BY created_at DESC
            """,
            params,
        ) as cur:
            rows = await cur.fetchall()
        return [
            {
                "run_id": row[0],
                "program_id": row[1],
                "machine_id": row[2],
                "status": row[3],
                "current_step_index": row[4],
                "total_steps": row[5],
                "current_node_id": row[6],
                "error": row[7],
                "created_at": row[8],
                "updated_at": row[9],
            }
            for row in rows
        ]
