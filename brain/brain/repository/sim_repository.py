from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.machine import SqlSimEntry
from brain.repository.session_decorator import with_session


class SimRepository:
    @with_session
    async def save_sim(
        self,
        session: AsyncSession,
        machine_id: str,
        slot: int,
        *,
        address: str,
        pid: int,
        actuator_id: str,
        joint_name: str,
    ) -> None:
        result = await session.execute(
            select(SqlSimEntry).where(and_(SqlSimEntry.machine_id == machine_id, SqlSimEntry.slot == slot))
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlSimEntry(
                machine_id=machine_id, slot=slot, address=address,
                pid=pid, actuator_id=actuator_id, joint_name=joint_name,
            )
            session.add(row)
        else:
            row.address = address
            row.pid = pid
            row.actuator_id = actuator_id
            row.joint_name = joint_name
        await session.commit()

    @with_session
    async def delete_sim(self, session: AsyncSession, machine_id: str, slot: int) -> None:
        result = await session.execute(
            select(SqlSimEntry).where(and_(SqlSimEntry.machine_id == machine_id, SqlSimEntry.slot == slot))
        )
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()

    @with_session
    async def delete_all_sims(self, session: AsyncSession, machine_id: str) -> None:
        result = await session.execute(select(SqlSimEntry).where(SqlSimEntry.machine_id == machine_id))
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()

    @with_session
    async def list_sims(self, session: AsyncSession, machine_id: str) -> list[SqlSimEntry]:
        """Return all sim_registry rows for a machine, ordered by slot."""
        result = await session.execute(
            select(SqlSimEntry)
            .where(SqlSimEntry.machine_id == machine_id)
            .order_by(SqlSimEntry.slot)
        )
        return list(result.scalars().all())

    @with_session
    async def list_all_sims(self, session: AsyncSession) -> list[SqlSimEntry]:
        """Return all sim_registry rows across all machines, ordered by machine then slot."""
        result = await session.execute(
            select(SqlSimEntry).order_by(SqlSimEntry.machine_id, SqlSimEntry.slot)
        )
        return list(result.scalars().all())
