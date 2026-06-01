import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.machine import Machine, SqlMachine, WorkspaceResult
from brain.repository.session_decorator import with_session


class MachineRepository:
    @with_session
    async def save_machine(
        self, machine_id: str, data: dict, *, created_by: str, session: AsyncSession | None = None
    ) -> None:
        assert session is not None
        description = data.get("description", data)
        expanded_urdf = data.get("expanded_urdf", "")
        result = await session.execute(
            select(SqlMachine).where(SqlMachine.machine_id == machine_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = SqlMachine(
                machine_id=machine_id,
                description_json=json.dumps(description),
                expanded_urdf=expanded_urdf,
                created_by=created_by,
                updated_by=created_by,
            )
            session.add(row)
        else:
            row.description_json = json.dumps(description)
            row.expanded_urdf = expanded_urdf
            row.updated_by = created_by
            row.updated_at = datetime.now(UTC)
        await session.commit()

    @with_session
    async def load_machine(
        self, machine_id: str, *, session: AsyncSession | None = None
    ) -> Machine | None:
        assert session is not None
        result = await session.execute(
            select(SqlMachine).where(SqlMachine.machine_id == machine_id)
        )
        row = result.scalar_one_or_none()
        return row.to_machine() if row else None

    @with_session
    async def list_machines(self, *, session: AsyncSession | None = None) -> list[str]:
        assert session is not None
        result = await session.execute(
            select(SqlMachine.machine_id).order_by(SqlMachine.created_at)
        )
        return [r[0] for r in result.fetchall()]

    @with_session
    async def delete_machine(self, machine_id: str, *, session: AsyncSession | None = None) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlMachine).where(SqlMachine.machine_id == machine_id)
        )
        row = result.scalar_one_or_none()
        if row:
            await session.delete(row)
            await session.commit()

    @with_session
    async def save_workspace(
        self,
        machine_id: str,
        workspace: WorkspaceResult,
        *,
        session: AsyncSession | None = None,
    ) -> None:
        assert session is not None
        result = await session.execute(
            select(SqlMachine).where(SqlMachine.machine_id == machine_id)
        )
        row = result.scalar_one_or_none()
        if row is not None:
            row.workspace_json = workspace.model_dump_json()
            row.updated_at = datetime.now(UTC)
            await session.commit()

    @with_session
    async def load_workspace(
        self,
        machine_id: str,
        *,
        session: AsyncSession | None = None,
    ) -> WorkspaceResult | None:
        assert session is not None
        result = await session.execute(
            select(SqlMachine.workspace_json).where(SqlMachine.machine_id == machine_id)
        )
        row = result.scalar_one_or_none()
        if not row:
            return None
        try:
            return WorkspaceResult.model_validate_json(row)
        except Exception:
            return None
