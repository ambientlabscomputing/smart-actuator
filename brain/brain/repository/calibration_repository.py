import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.calibration import (
    CalibrationJobState,
    CalibrationJobStatus,
    SqlCalibrationSession,
)
from brain.repository.session_decorator import with_session


class CalibrationRepository:
    @with_session
    async def save_calibration_session(
        self, job_id: str, data: dict, *, created_by: str, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlCalibrationSession).where(SqlCalibrationSession.job_id == job_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlCalibrationSession(
                job_id=job_id,
                machine_id=data["machine_id"],
                joint_index=data["joint_index"],
                status=data["status"],
                step=data["step"],
                prompt=data.get("prompt", ""),
                last_measurement_json=json.dumps(data.get("last_measurement", {})),
                result_json=json.dumps(data.get("result", {})),
                error=data.get("error", ""),
                created_by=created_by,
                updated_by=created_by,
            )
            session.add(row)
        else:
            row.status = data["status"]
            row.step = data["step"]
            row.prompt = data.get("prompt", "")
            row.last_measurement_json = json.dumps(data.get("last_measurement", {}))
            row.result_json = json.dumps(data.get("result", {}))
            row.error = data.get("error", "")
            row.updated_by = created_by
            row.updated_at = datetime.now(UTC)
        await session.commit()

    @with_session
    async def load_calibration_session(
        self, job_id: str, *, session: AsyncSession | None = None
    ) -> CalibrationJobState | None:
        assert session is not None
        result = await session.execute(
            select(SqlCalibrationSession).where(SqlCalibrationSession.job_id == job_id)
        )
        row = result.scalar_one_or_none()
        return row.to_state() if row else None

    @with_session
    async def list_calibration_sessions(
        self,
        machine_id: str | None = None,
        *,
        active_only: bool = False,
        session: AsyncSession | None = None,
    ) -> list[CalibrationJobState]:
        assert session is not None
        terminal = {
            CalibrationJobStatus.completed,
            CalibrationJobStatus.aborted,
            CalibrationJobStatus.faulted,
        }
        stmt = select(SqlCalibrationSession)
        if machine_id is not None:
            stmt = stmt.where(SqlCalibrationSession.machine_id == machine_id)
        if active_only:
            stmt = stmt.where(SqlCalibrationSession.status.notin_(terminal))
        stmt = stmt.order_by(SqlCalibrationSession.created_at.desc())
        result = await session.execute(stmt)
        return [row.to_state() for row in result.scalars().all()]

    @with_session
    async def delete_calibration_session(
        self, job_id: str, *, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlCalibrationSession).where(SqlCalibrationSession.job_id == job_id)
        )
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()
