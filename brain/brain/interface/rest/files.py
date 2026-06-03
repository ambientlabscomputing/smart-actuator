from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile

from brain.interface.rest.deps import get_service
from brain.models.stored_file import StoredFile, StoredFilesRequest, StoredFilesResponse
from brain.service.service import BrainService

router = APIRouter(tags=["files"])

Service = Annotated[BrainService, Depends(get_service)]


@router.post("/files", response_model=StoredFile, status_code=201)
async def upload_file(file: UploadFile, svc: Service, request: Request) -> StoredFile:
    """Upload a file and persist its metadata. The raw bytes are saved to the configured storage directory."""
    if not file.filename:
        raise HTTPException(status_code=422, detail="filename is required")
    data = await file.read()
    created_by: str = request.state.user.username
    return await svc.file_service.upload_file(file.filename, data, created_by=created_by)


@router.get("/files", response_model=StoredFilesResponse)
async def list_files(svc: Service, location: str | None = None, offset: int = 0, limit: int = 50) -> StoredFilesResponse:
    """List stored files, optionally filtered by location substring."""
    req = StoredFilesRequest(location=location, offset=offset, limit=limit)
    items, total = await svc.file_service.search_files(req)
    return StoredFilesResponse(items=items, total=total)


@router.get("/files/{file_id}", response_model=StoredFile)
async def get_file(file_id: int, svc: Service) -> StoredFile:
    """Return metadata for a single stored file."""
    stored = await svc.file_service.get_file(file_id)
    if stored is None:
        raise HTTPException(status_code=404, detail=f"File {file_id} not found")
    return stored


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: int, svc: Service) -> None:
    """Delete a stored file from disk and the database."""
    stored = await svc.file_service.get_file(file_id)
    if stored is None:
        raise HTTPException(status_code=404, detail=f"File {file_id} not found")
    await svc.file_service.delete_file(file_id)
