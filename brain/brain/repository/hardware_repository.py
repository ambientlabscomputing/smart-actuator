from datetime import UTC, datetime

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.machine import SqlHardwareEntry
from brain.repository.session_decorator import with_session


class HardwareRepository:
    @with_session
    async def save_hardware(
        self,
        machine_id: str,
        slot: int,
        *,
        address: str,
        actuator_id: str,
        joint_name: str,
        created_by: str,
        session: AsyncSession | None = None,
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlHardwareEntry).where(
                and_(SqlHardwareEntry.machine_id == machine_id, SqlHardwareEntry.slot == slot)
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlHardwareEntry(
                machine_id=machine_id,
                slot=slot,
                address=address,
                actuator_id=actuator_id,
                joint_name=joint_name,
                created_by=created_by,
                updated_by=created_by,
            )
            session.add(row)
        else:
            row.address = address
            row.actuator_id = actuator_id
            row.joint_name = joint_name
            row.updated_by = created_by
            row.updated_at = datetime.now(UTC)
        await session.commit()

    @with_session
    async def delete_hardware(
        self, machine_id: str, slot: int, *, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlHardwareEntry).where(
                and_(SqlHardwareEntry.machine_id == machine_id, SqlHardwareEntry.slot == slot)
            )
        )
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()

    @with_session
    async def delete_all_hardware(
        self, machine_id: str, *, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlHardwareEntry).where(SqlHardwareEntry.machine_id == machine_id)
        )
        for row in result.scalars().all():
            await session.delete(row)
        await session.commit()

    @with_session
    async def list_hardware(
        self, machine_id: str, *, session: AsyncSession | None = None
    ) -> list[SqlHardwareEntry]:
        assert session is not None
        result = await session.execute(
            select(SqlHardwareEntry)
            .where(SqlHardwareEntry.machine_id == machine_id)
            .order_by(SqlHardwareEntry.slot)
        )
        return list(result.scalars().all())

    @with_session
    async def list_all_hardware(
        self, *, session: AsyncSession | None = None
    ) -> list[SqlHardwareEntry]:
        assert session is not None
        result = await session.execute(
            select(SqlHardwareEntry).order_by(SqlHardwareEntry.machine_id, SqlHardwareEntry.slot)
        )
        return list(result.scalars().all())
