import json

import aiosqlite


class CalibrationRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def save_calibration_session(self, job_id: str, data: dict) -> None:
        await self._conn.execute(
            """
            INSERT INTO calibration_sessions
                (job_id, machine_id, joint_index, status, step, prompt,
                 last_measurement_json, result_json, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                status                = excluded.status,
                step                  = excluded.step,
                prompt                = excluded.prompt,
                last_measurement_json = excluded.last_measurement_json,
                result_json           = excluded.result_json,
                error                 = excluded.error,
                updated_at            = strftime('%s','now')
            """,
            (
                job_id,
                data["machine_id"],
                data["joint_index"],
                data["status"],
                data["step"],
                data.get("prompt", ""),
                json.dumps(data.get("last_measurement", {})),
                json.dumps(data.get("result", {})),
                data.get("error", ""),
            ),
        )
        await self._conn.commit()

    async def load_calibration_session(self, job_id: str) -> dict | None:
        async with self._conn.execute(
            """
            SELECT job_id, machine_id, joint_index, status, step, prompt,
                   last_measurement_json, result_json, error, created_at, updated_at
            FROM calibration_sessions WHERE job_id = ?
            """,
            (job_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        return {
            "job_id": row[0],
            "machine_id": row[1],
            "joint_index": row[2],
            "status": row[3],
            "step": row[4],
            "prompt": row[5],
            "last_measurement": json.loads(row[6]),
            "result": json.loads(row[7]),
            "error": row[8],
            "created_at": row[9],
            "updated_at": row[10],
        }

    async def list_calibration_sessions(
        self, machine_id: str | None = None, *, active_only: bool = False
    ) -> list[dict]:
        terminal = ("completed", "aborted", "faulted")
        conditions: list[str] = []
        params: list[object] = []
        if machine_id is not None:
            conditions.append("machine_id = ?")
            params.append(machine_id)
        if active_only:
            placeholders = ",".join("?" * len(terminal))
            conditions.append(f"status NOT IN ({placeholders})")
            params.extend(terminal)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        async with self._conn.execute(
            f"""
            SELECT job_id, machine_id, joint_index, status, step, prompt,
                   last_measurement_json, result_json, error, created_at, updated_at
            FROM calibration_sessions
            {where}
            ORDER BY created_at DESC
            """,
            params,
        ) as cur:
            rows = await cur.fetchall()
        return [
            {
                "job_id": r[0],
                "machine_id": r[1],
                "joint_index": r[2],
                "status": r[3],
                "step": r[4],
                "prompt": r[5],
                "last_measurement": json.loads(r[6]),
                "result": json.loads(r[7]),
                "error": r[8],
                "created_at": r[9],
                "updated_at": r[10],
            }
            for r in rows
        ]

    async def delete_calibration_session(self, job_id: str) -> None:
        await self._conn.execute(
            "DELETE FROM calibration_sessions WHERE job_id = ?", (job_id,)
        )
        await self._conn.commit()
