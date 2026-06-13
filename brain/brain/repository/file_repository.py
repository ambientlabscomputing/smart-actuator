from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from brain.models.base import build_query
from brain.models.stored_file import (
    SqlStoredFile,
    StoredFile,
    StoredFilesRequest,
    UploadFileRequest,
)
from brain.repository.session_decorator import with_session


class FileRepository:
    @with_session
    async def create_file(
        self,
        upload_file_request: UploadFileRequest,
        *,
        created_by: str,
        session: AsyncSession | None = None,
    ) -> StoredFile:
        if not session:
            raise ValueError("Session is required for create_file")
        sql_file = SqlStoredFile(
            location=upload_file_request.location,
            size_bytes=upload_file_request.size_bytes,
            created_by=created_by,
            updated_by=created_by,
        )
        session.add(sql_file)
        await session.commit()
        await session.refresh(sql_file)
        return StoredFile.model_validate(sql_file)

    @with_session
    async def get_file(
        self, file_id: int, session: AsyncSession | None = None
    ) -> StoredFile | None:
        if not session:
            raise ValueError("Session is required for get_file")
        sql_file = await session.get(SqlStoredFile, file_id)
        if sql_file is None:
            return None
        return StoredFile.model_validate(sql_file)

    @with_session
    async def search_files(
        self, stored_files_request: StoredFilesRequest, session: AsyncSession | None = None
    ) -> tuple[list[StoredFile], int]:
        if not session:
            raise ValueError("Session is required for search_files")
        query = build_query(SqlStoredFile, stored_files_request)
        if stored_files_request.location:
            query = query.where(SqlStoredFile.location.ilike(f"%{stored_files_request.location}%"))
        result = await session.execute(query)
        sql_files = result.scalars().all()
        total_query = select(func.count()).select_from(SqlStoredFile)
        if stored_files_request.location:
            total_query = total_query.where(
                SqlStoredFile.location.ilike(f"%{stored_files_request.location}%")
            )
        total_result = await session.execute(total_query)
        total_count = total_result.scalar_one()
        return [StoredFile.model_validate(sql_file) for sql_file in sql_files], total_count

    @with_session
    async def delete_file(self, file_id: int, session: AsyncSession | None = None) -> None:
        if not session:
            raise ValueError("Session is required for delete_file")
        sql_file = await session.get(SqlStoredFile, file_id)
        if sql_file:
            await session.delete(sql_file)
            await session.commit()
