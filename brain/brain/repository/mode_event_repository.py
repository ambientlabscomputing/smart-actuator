import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.state import ModeEvent, SqlModeEvent
from brain.repository.session_decorator import with_session


class ModeEventRepository:
    @with_session
    async def append_mode_event(
        self, event: ModeEvent | dict, *, created_by: str, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        if isinstance(event, ModeEvent):
            machine_id = event.machine_id
            event_json = event.model_dump_json()
        else:
            machine_id = event.get("machine_id", "")
            event_json = json.dumps(event)
        row = SqlModeEvent(
            machine_id=machine_id,
            event_json=event_json,
            created_by=created_by,
            updated_by=created_by,
        )
        session.add(row)
        await session.commit()

    @with_session
    async def get_mode_events(
        self, machine_id: str, limit: int = 100, *, session: AsyncSession | None = None
    ) -> list[ModeEvent]:
        assert session is not None
        result = await session.execute(
            select(SqlModeEvent)
            .where(SqlModeEvent.machine_id == machine_id)
            .order_by(SqlModeEvent.created_at.desc())
            .limit(limit)
        )
        return [row.to_event() for row in result.scalars().all()]
