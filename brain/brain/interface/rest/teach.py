"""
Teach-mode REST router (RFD-13).

URL structure:
  POST   /machines/{machine_id}/teach              start session
  GET    /machines/{machine_id}/teach              get active session
  POST   /teach/sessions/{session_id}/record       arm → recording
  POST   /teach/sessions/{session_id}/capture      snapshot waypoint
  DELETE /teach/sessions/{session_id}/waypoints/{index}  drop waypoint
  POST   /teach/sessions/{session_id}/save         materialise as Program
  POST   /teach/sessions/{session_id}/abort        discard session
  WS     /teach/sessions/{session_id}/ws           live updates
"""

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.teach import TeachMode, TeachSessionState
from brain.service.service import BrainService

router = APIRouter(tags=["teach"])

Service = Annotated[BrainService, Depends(get_service)]


# ─── Request bodies ───────────────────────────────────────────────────────────


class StartSessionBody(BaseModel):
    mode: TeachMode = TeachMode.drag


class SaveSessionBody(BaseModel):
    name: str


# ─── Session lifecycle ────────────────────────────────────────────────────────


@router.post(
    "/machines/{machine_id}/teach",
    response_model=TeachSessionState,
    status_code=201,
    summary="Start a teach session",
)
async def start_session(
    machine_id: str, body: StartSessionBody, svc: Service, request: Request
) -> TeachSessionState:
    """Create a new teach session for the given machine."""
    try:
        return await svc.teach.start_session(
            machine_id, body.mode, created_by=request.state.user.username
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/machines/{machine_id}/teach",
    response_model=TeachSessionState,
    summary="Get the active teach session",
)
async def get_session(machine_id: str, svc: Service) -> TeachSessionState:
    """Return the current (or most recent) teach session for a machine."""
    session = svc.teach.get_session(machine_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f"No teach session found for machine {machine_id!r}",
        )
    return session


# ─── Session actions ──────────────────────────────────────────────────────────


@router.post(
    "/teach/sessions/{session_id}/record",
    response_model=TeachSessionState,
    summary="Start recording (armed → recording)",
)
async def start_recording(
    session_id: str, svc: Service, request: Request
) -> TeachSessionState:
    try:
        return await svc.teach.start_recording(
            session_id, created_by=request.state.user.username
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/teach/sessions/{session_id}/capture",
    response_model=TeachSessionState,
    summary="Capture current joint state as a waypoint",
)
async def capture(session_id: str, svc: Service, request: Request) -> TeachSessionState:
    try:
        return await svc.teach.capture(session_id, created_by=request.state.user.username)
    except ValueError as exc:
        code = 422 if "No joint state" in str(exc) else 409
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.delete(
    "/teach/sessions/{session_id}/waypoints/{index}",
    response_model=TeachSessionState,
    summary="Delete a captured waypoint by index",
)
async def delete_waypoint(
    session_id: str, index: int, svc: Service, request: Request
) -> TeachSessionState:
    try:
        return await svc.teach.delete_waypoint(
            session_id, index, created_by=request.state.user.username
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/teach/sessions/{session_id}/save",
    summary="Save waypoints as a Program",
    status_code=201,
)
async def save_session(
    session_id: str, body: SaveSessionBody, svc: Service, request: Request
) -> dict[str, str]:
    """Materialise the recorded waypoints as a Program and return its ID."""
    try:
        _, program_id = await svc.teach.save(
            session_id, body.name, created_by=request.state.user.username
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"program_id": program_id, "session_id": session_id}


@router.post(
    "/teach/sessions/{session_id}/abort",
    response_model=TeachSessionState,
    summary="Abort a teach session",
)
async def abort_session(
    session_id: str, svc: Service, request: Request
) -> TeachSessionState:
    try:
        return await svc.teach.abort(session_id, created_by=request.state.user.username)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# ─── WebSocket — live session updates ────────────────────────────────────────


@router.websocket("/teach/sessions/{session_id}/ws")
async def session_ws(session_id: str, websocket: WebSocket) -> None:
    """
    Stream teach session state transitions in real time.

    Sends an initial snapshot on connect, then fans out every subsequent
    state update.  Slow consumers drop frames (queue full → discard).
    """
    svc = get_service()

    session = svc.teach.get_session_by_id(session_id)
    if session is None:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    await websocket.send_text(session.model_dump_json())

    topic = f"teach/{session_id}"
    q: asyncio.Queue[dict] = asyncio.Queue(maxsize=20)

    def on_event(event: dict) -> None:
        if event.get("topic") == topic:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass  # slow consumer — drop frame

    svc.observability._event_queues.append(  # type: ignore[attr-defined]
        _CallbackQueue(on_event)
    )

    try:
        while True:
            event = await q.get()
            state = TeachSessionState(
                **{k: v for k, v in event.items() if k not in ("type", "topic")}
            )
            await websocket.send_text(state.model_dump_json())
    except WebSocketDisconnect:
        pass
    finally:
        svc.observability._event_queues[:] = [  # type: ignore[attr-defined]
            q
            for q in svc.observability._event_queues  # type: ignore[attr-defined]
            if not isinstance(q, _CallbackQueue) or q._cb is not on_event
        ]


class _CallbackQueue(asyncio.Queue[dict[str, Any]]):
    """Shim routing events through a filter callback (mirrors programs.py)."""

    def __init__(self, cb) -> None:
        super().__init__(maxsize=0)
        self._cb = cb

    def put_nowait(self, item: dict[str, Any]) -> None:  # noqa: D401
        self._cb(item)
