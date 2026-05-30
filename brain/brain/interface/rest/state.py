import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from brain.interface.rest.deps import get_service
from brain.models.state import MachineState
from brain.service.service import BrainService

router = APIRouter(prefix="/state", tags=["state"])

Service = Annotated[BrainService, Depends(get_service)]


@router.get("", response_model=MachineState)
async def get_state(machine_id: str, svc: Service) -> MachineState:
    state = svc.state.get_measured_state(machine_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"No state for machine {machine_id!r}")
    return state


@router.websocket("/ws")
async def stream_state(websocket: WebSocket, machine_id: str) -> None:
    svc = get_service()

    await websocket.accept()

    q: asyncio.Queue[MachineState] = asyncio.Queue(maxsize=10)

    def on_state(state: MachineState) -> None:
        if state.machine_id == machine_id:
            try:
                q.put_nowait(state)
            except asyncio.QueueFull:
                pass  # slow consumer - drop frame

    svc.state.subscribe(on_state)

    try:
        while True:
            state = await q.get()
            await websocket.send_text(state.model_dump_json())
    except WebSocketDisconnect:
        pass
