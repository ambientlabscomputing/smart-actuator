import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from brain.interface.rest.deps import get_service

router = APIRouter(prefix="/events", tags=["events"])


@router.websocket("/ws")
async def stream_events(websocket: WebSocket) -> None:
    """
    WebSocket — streams the Brain event bus to the client.
    Events include mode changes, command accept/refuse, and faults.
    """
    svc = get_service()
    await websocket.accept()
    try:
        async for event in svc.observability.event_stream():
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        pass
