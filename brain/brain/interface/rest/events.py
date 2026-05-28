import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from brain.service.service import BrainService

router = APIRouter(prefix="/events", tags=["events"])


@router.websocket("/ws")
async def stream_events(websocket: WebSocket) -> None:
    """
    WebSocket — streams the Brain event bus to the client.
    Events include mode changes, command accept/refuse, and faults.
    """
    svc: BrainService = websocket.app.state.brain
    await websocket.accept()
    try:
        async for event in svc.observability.event_stream():
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
