import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.teach import SqlTeachSession, TeachSessionState
from brain.repository.session_decorator import with_session


class TeachRepository:
    # ------------------------------------------------------------------
    # Session persistence
    # ------------------------------------------------------------------

    @with_session
    async def save_session(
        self,
        session_id: str,
        data: dict,
        *,
        created_by: str,
        session: AsyncSession | None = None,
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlTeachSession).where(SqlTeachSession.session_id == session_id)
        )
        row = result.scalar_one_or_none()
        machine_id = data.get("machine_id", "")
        status = data.get("status", "idle")
        if row is None:
            row = SqlTeachSession(
                session_id=session_id,
                machine_id=machine_id,
                status=status,
                data_json=json.dumps(data),
                created_by=created_by,
                updated_by=created_by,
            )
            session.add(row)
        else:
            row.status = status
            row.data_json = json.dumps(data)
            row.updated_by = created_by
            row.updated_at = datetime.now(UTC)
        await session.commit()

    @with_session
    async def load_session(
        self, session_id: str, *, session: AsyncSession | None = None
    ) -> TeachSessionState | None:
        assert session is not None
        result = await session.execute(
            select(SqlTeachSession).where(SqlTeachSession.session_id == session_id)
        )
        row = result.scalar_one_or_none()
        return row.to_state() if row else None

    @with_session
    async def list_sessions(
        self, machine_id: str | None = None, *, session: AsyncSession | None = None
    ) -> list[TeachSessionState]:
        assert session is not None
        q = select(SqlTeachSession).order_by(SqlTeachSession.updated_at.desc())
        if machine_id is not None:
            q = q.where(SqlTeachSession.machine_id == machine_id)
        result = await session.execute(q)
        return [row.to_state() for row in result.scalars().all()]

    @with_session
    async def delete_session(self, session_id: str, *, session: AsyncSession | None = None) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlTeachSession).where(SqlTeachSession.session_id == session_id)
        )
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()
