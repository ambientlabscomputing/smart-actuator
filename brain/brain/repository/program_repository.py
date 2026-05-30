import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.program import (
    Program,
    ProgramRunState,
    ProgramRunStatus,
    SqlProgram,
    SqlProgramRun,
)
from brain.repository.session_decorator import with_session


class ProgramRepository:
    # ------------------------------------------------------------------
    # Program library
    # ------------------------------------------------------------------

    @with_session
    async def save_program(
        self, program_id: str, data: dict, *, created_by: str, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlProgram).where(SqlProgram.program_id == program_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlProgram(
                program_id=program_id,
                data_json=json.dumps(data),
                created_by=created_by,
                updated_by=created_by,
            )
            session.add(row)
        else:
            row.data_json = json.dumps(data)
            row.updated_by = created_by
            row.updated_at = datetime.now(UTC)
        await session.commit()

    @with_session
    async def load_program(
        self, program_id: str, *, session: AsyncSession | None = None
    ) -> Program | None:
        assert session is not None
        result = await session.execute(
            select(SqlProgram).where(SqlProgram.program_id == program_id)
        )
        row = result.scalar_one_or_none()
        return row.to_program() if row else None

    @with_session
    async def list_programs(self, *, session: AsyncSession | None = None) -> list[SqlProgram]:
        assert session is not None
        result = await session.execute(select(SqlProgram).order_by(SqlProgram.updated_at.desc()))
        return list(result.scalars().all())

    @with_session
    async def delete_program(self, program_id: str, *, session: AsyncSession | None = None) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlProgram).where(SqlProgram.program_id == program_id)
        )
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()

    # ------------------------------------------------------------------
    # Program runs
    # ------------------------------------------------------------------

    @with_session
    async def save_program_run(
        self, run_id: str, data: dict, *, created_by: str, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(select(SqlProgramRun).where(SqlProgramRun.run_id == run_id))
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlProgramRun(
                run_id=run_id,
                program_id=data["program_id"],
                machine_id=data["machine_id"],
                status=data["status"],
                current_step_index=data.get("current_step_index", 0),
                total_steps=data.get("total_steps", 0),
                current_node_id=data.get("current_node_id", ""),
                error=data.get("error", ""),
                created_by=created_by,
                updated_by=created_by,
            )
            session.add(row)
        else:
            row.status = data["status"]
            row.current_step_index = data.get("current_step_index", 0)
            row.total_steps = data.get("total_steps", 0)
            row.current_node_id = data.get("current_node_id", "")
            row.error = data.get("error", "")
            row.updated_by = created_by
            row.updated_at = datetime.now(UTC)
        await session.commit()

    @with_session
    async def load_program_run(
        self, run_id: str, *, session: AsyncSession | None = None
    ) -> ProgramRunState | None:
        assert session is not None
        result = await session.execute(select(SqlProgramRun).where(SqlProgramRun.run_id == run_id))
        row = result.scalar_one_or_none()
        return row.to_state() if row else None

    @with_session
    async def list_program_runs(
        self,
        program_id: str | None = None,
        *,
        active_only: bool = False,
        session: AsyncSession | None = None,
    ) -> list[ProgramRunState]:
        assert session is not None
        _TERMINAL = {
            ProgramRunStatus.completed,
            ProgramRunStatus.stopped,
            ProgramRunStatus.faulted,
            ProgramRunStatus.interrupted,
        }
        stmt = select(SqlProgramRun)
        if program_id is not None:
            stmt = stmt.where(SqlProgramRun.program_id == program_id)
        if active_only:
            stmt = stmt.where(SqlProgramRun.status.notin_(_TERMINAL))
        stmt = stmt.order_by(SqlProgramRun.created_at.desc())
        result = await session.execute(stmt)
        return [row.to_state() for row in result.scalars().all()]
