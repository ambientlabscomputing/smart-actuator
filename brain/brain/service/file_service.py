import asyncio
from pathlib import Path

from brain.models.stored_file import StoredFile, StoredFilesRequest, UploadFileRequest
from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger


class FileService:
    def __init__(self, repository: Repository, config: Config) -> None:
        self._repo = repository
        self._storage_dir = Path(config.files.storage_dir).expanduser()

    async def upload_file(self, filename: str, data: bytes, *, created_by: str) -> StoredFile:
        await asyncio.to_thread(self._storage_dir.mkdir, parents=True, exist_ok=True)
        dest = self._storage_dir / filename
        await asyncio.to_thread(dest.write_bytes, data)
        logger.info("Saved uploaded file to {}", dest)
        request = UploadFileRequest(location=str(dest), size_bytes=len(data))
        return await self._repo.files.create_file(request, created_by=created_by)

    async def get_file(self, file_id: int) -> StoredFile | None:
        return await self._repo.files.get_file(file_id)

    async def search_files(self, request: StoredFilesRequest) -> tuple[list[StoredFile], int]:
        return await self._repo.files.search_files(request)

    async def delete_file(self, file_id: int) -> None:
        stored = await self._repo.files.get_file(file_id)
        if stored is None:
            return
        path = Path(stored.location)
        if path.exists():
            await asyncio.to_thread(path.unlink)
            logger.info("Deleted file from disk: {}", path)
        await self._repo.files.delete_file(file_id)

    async def read_file(self, file_id: int) -> bytes | None:
        """Return the raw bytes of a stored file, or None if the record or file on disk is missing."""
        stored = await self._repo.files.get_file(file_id)
        if stored is None:
            return None
        path = Path(stored.location)
        if not path.exists():
            logger.warning("File record {} exists but path not found on disk: {}", file_id, path)
            return None
        return await asyncio.to_thread(path.read_bytes)
