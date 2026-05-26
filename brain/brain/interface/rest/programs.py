from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.program import Program, ProgramMeta
from brain.service.service import BrainService

router = APIRouter(prefix="/programs", tags=["programs"])

Service = Annotated[BrainService, Depends(get_service)]


class RunProgramBody(BaseModel):
    machine_id: str


@router.get("", response_model=list[ProgramMeta])
async def list_programs(svc: Service) -> list[ProgramMeta]:
    """Return metadata for all stored programs."""
    return await svc.programs.list_programs()


@router.get("/{program_id}", response_model=Program)
async def get_program(program_id: str, svc: Service) -> Program:
    """Return a single program by ID."""
    program = await svc.programs.load_program(program_id)
    if program is None:
        raise HTTPException(status_code=404, detail=f"Program {program_id!r} not found")
    return program


@router.post("", response_model=Program, status_code=201)
async def save_program(program: Program, svc: Service) -> Program:
    """Create or replace a program."""
    await svc.programs.save_program(program)
    return program


@router.delete("/{program_id}", status_code=204)
async def delete_program(program_id: str, svc: Service) -> None:
    """Delete a program."""
    await svc.programs.delete_program(program_id)


@router.post("/{program_id}/run")
async def run_program(program_id: str, body: RunProgramBody, svc: Service) -> dict:
    """Type-check and run a program. Returns immediately; execution is async."""
    await svc.programs.run_program(program_id, body.machine_id)
    return {"program_id": program_id, "status": "running"}


@router.post("/{program_id}/pause")
async def pause_program(program_id: str, svc: Service) -> dict:
    await svc.programs.pause_program(program_id)
    return {"program_id": program_id, "status": "paused"}


@router.post("/{program_id}/resume")
async def resume_program(program_id: str, svc: Service) -> dict:
    await svc.programs.resume_program(program_id)
    return {"program_id": program_id, "status": "running"}


@router.post("/{program_id}/abort")
async def abort_program(program_id: str, svc: Service) -> dict:
    await svc.programs.abort_program(program_id)
    return {"program_id": program_id, "status": "aborted"}
