from datetime import UTC, datetime

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.machine import SqlSimEntry
from brain.repository.session_decorator import with_session


class SimRepository:
    @with_session
    async def save_sim(
        self,
        machine_id: str,
        slot: int,
        *,
        address: str,
        pid: int,
        actuator_id: str,
        joint_name: str,
        created_by: str,
        session: AsyncSession | None = None,
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlSimEntry).where(
                and_(SqlSimEntry.machine_id == machine_id, SqlSimEntry.slot == slot)
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlSimEntry(
                machine_id=machine_id,
                slot=slot,
                address=address,
                pid=pid,
                actuator_id=actuator_id,
                joint_name=joint_name,
                created_by=created_by,
                updated_by=created_by,
            )
            session.add(row)
        else:
            row.address = address
            row.pid = pid
            row.actuator_id = actuator_id
            row.joint_name = joint_name
            row.updated_by = created_by
            row.updated_at = datetime.now(UTC)
        await session.commit()

    @with_session
    async def delete_sim(
        self, machine_id: str, slot: int, *, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlSimEntry).where(
                and_(SqlSimEntry.machine_id == machine_id, SqlSimEntry.slot == slot)
            )
        )
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()

    @with_session
    async def delete_all_sims(
        self, machine_id: str, *, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlSimEntry).where(SqlSimEntry.machine_id == machine_id)
        )
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()

    @with_session
    async def list_sims(
        self, machine_id: str, *, session: AsyncSession | None = None
    ) -> list[SqlSimEntry]:
        """Return all sim_registry rows for a machine, ordered by slot."""
        assert session is not None
        result = await session.execute(
            select(SqlSimEntry)
            .where(SqlSimEntry.machine_id == machine_id)
            .order_by(SqlSimEntry.slot)
        )
        return list(result.scalars().all())

    @with_session
    async def list_all_sims(self, *, session: AsyncSession | None = None) -> list[SqlSimEntry]:
        """Return all sim_registry rows across all machines, ordered by machine then slot."""
        assert session is not None
        result = await session.execute(
            select(SqlSimEntry).order_by(SqlSimEntry.machine_id, SqlSimEntry.slot)
        )
        return list(result.scalars().all())
