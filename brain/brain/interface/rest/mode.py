from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.state import MachineMode, ModeEvent
from brain.service.service import BrainService

router = APIRouter(prefix="/mode", tags=["mode"])

Service = Annotated[BrainService, Depends(get_service)]


class ModeRequest(BaseModel):
    mode: MachineMode
    reason: str = ""


@router.get("")
async def get_mode(machine_id: str, svc: Service) -> dict:
    """Return the current operating mode for a machine."""
    mode = svc.lifecycle.get_mode(machine_id)
    return {"machine_id": machine_id, "mode": mode}


@router.post("")
async def set_mode(machine_id: str, body: ModeRequest, svc: Service) -> dict:
    """Request a mode transition. Raises 400 if the transition is not permitted."""
    await svc.lifecycle.request_mode(machine_id, body.mode, body.reason)
    return {"machine_id": machine_id, "mode": body.mode}


@router.get("/history", response_model=list[ModeEvent])
async def get_mode_history(machine_id: str, svc: Service) -> list[ModeEvent]:
    """Return mode-change history for a machine (oldest first)."""
    return await svc.lifecycle.get_mode_history(machine_id)
