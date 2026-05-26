from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from brain.interface.rest.deps import get_service
from brain.models.state import MachineState
from brain.service.service import BrainService

router = APIRouter(prefix="/state", tags=["state"])

Service = Annotated[BrainService, Depends(get_service)]


@router.get("", response_model=MachineState)
async def get_state(machine_id: str, svc: Service) -> MachineState:
    """Return a snapshot of the current measured machine state."""
    state = svc.state.get_measured_state(machine_id)
    if state is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=f"No state for machine {machine_id!r}")
    return state


@router.websocket("/ws")
async def stream_state(
    websocket: WebSocket, machine_id: str, svc: BrainService = Depends(get_service)
) -> None:
    """WebSocket — streams live machine state updates to the client."""
    await websocket.accept()
    queue_ref: list = []

    def on_state(state: MachineState) -> None:
        if state.machine_id == machine_id:
            try:
                websocket.state  # check if still open (no-op attribute access)
                import asyncio

                asyncio.get_event_loop().call_soon_threadsafe(
                    lambda: queue_ref[0].put_nowait(state) if queue_ref else None
                )
            except Exception:
                pass

    import asyncio

    q: asyncio.Queue[MachineState] = asyncio.Queue()
    queue_ref.append(q)
    svc.state.subscribe(on_state)

    try:
        while True:
            state = await q.get()
            await websocket.send_text(state.model_dump_json())
    except WebSocketDisconnect:
        pass
