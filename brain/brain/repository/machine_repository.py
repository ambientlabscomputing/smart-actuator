import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.machine import Machine, MachineDescription, SqlMachine
from brain.repository.session_decorator import with_session


class MachineRepository:
    @with_session
    async def save_machine(self, session: AsyncSession, machine_id: str, data: dict) -> None:
        description = data.get("description", data)
        expanded_urdf = data.get("expanded_urdf", "")
        result = await session.execute(select(SqlMachine).where(SqlMachine.machine_id == machine_id))
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlMachine(
                machine_id=machine_id,
                description_json=json.dumps(description),
                expanded_urdf=expanded_urdf,
            )
            session.add(row)
        else:
            row.description_json = json.dumps(description)
            row.expanded_urdf = expanded_urdf
        await session.commit()

    @with_session
    async def load_machine(self, session: AsyncSession, machine_id: str) -> Machine | None:
        result = await session.execute(select(SqlMachine).where(SqlMachine.machine_id == machine_id))
        row = result.scalar_one_or_none()
        return row.to_machine() if row else None

    @with_session
    async def list_machines(self, session: AsyncSession) -> list[str]:
        result = await session.execute(select(SqlMachine.machine_id).order_by(SqlMachine.created_at))
        return [r[0] for r in result.fetchall()]

    @with_session
    async def delete_machine(self, session: AsyncSession, machine_id: str) -> None:
        result = await session.execute(select(SqlMachine).where(SqlMachine.machine_id == machine_id))
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()
