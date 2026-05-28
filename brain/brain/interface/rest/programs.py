"""
Programs REST router (J5).

URL structure mirrors the calibration router:
  CRUD:   /programs, /programs/{program_id}
  Runs:   /programs/{program_id}/runs  (create)
          /runs/{run_id}               (get)
          /runs/{run_id}/stop          (stop)
          /programs/{program_id}/runs  (list)
  WS:     /runs/{run_id}/ws            (live updates)
"""
import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.program import Program, ProgramMeta, ProgramRunState
from brain.service.service import BrainService

router = APIRouter(tags=["programs"])

Service = Annotated[BrainService, Depends(get_service)]


# ─── Request bodies ───────────────────────────────────────────────────────────


class StartRunBody(BaseModel):
    machine_id: str


# ─── Program CRUD ─────────────────────────────────────────────────────────────


@router.get("/programs", response_model=list[ProgramMeta])
async def list_programs(svc: Service) -> list[ProgramMeta]:
    """Return metadata for all stored programs."""
    return await svc.programs.list_programs()


@router.get("/programs/{program_id}", response_model=Program)
async def get_program(program_id: str, svc: Service) -> Program:
    """Return a single program by ID."""
    program = await svc.programs.load_program(program_id)
    if program is None:
        raise HTTPException(status_code=404, detail=f"Program {program_id!r} not found")
    return program


@router.post("/programs", response_model=Program, status_code=201)
async def save_program(program: Program, svc: Service) -> Program:
    """Create or replace a program. Validates AST structure (root SEQUENCE, MOVE/WAIT nodes only)."""
    try:
        await svc.programs.save_program(program)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return program


@router.delete("/programs/{program_id}", status_code=204)
async def delete_program(program_id: str, svc: Service) -> None:
    """Delete a program."""
    await svc.programs.delete_program(program_id)


# ─── Run management ───────────────────────────────────────────────────────────


@router.post(
    "/programs/{program_id}/runs",
    response_model=ProgramRunState,
    status_code=201,
    summary="Start a program run",
)
async def start_run(
    program_id: str, body: StartRunBody, svc: Service
) -> ProgramRunState:
    """
    Start executing the named program against the given machine.
    Returns immediately with the initial ProgramRunState (status=running).
    """
    try:
        return await svc.programs.start_run(program_id, body.machine_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/programs/{program_id}/runs",
    response_model=list[ProgramRunState],
    summary="List runs for a program",
)
async def list_runs(
    program_id: str,
    svc: Service,
    active_only: bool = False,
) -> list[ProgramRunState]:
    return svc.programs.list_runs(program_id=program_id, active_only=active_only)


@router.get(
    "/runs/{run_id}",
    response_model=ProgramRunState,
    summary="Get a run's current state",
)
async def get_run(run_id: str, svc: Service) -> ProgramRunState:
    run = svc.programs.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return run


@router.post(
    "/runs/{run_id}/stop",
    response_model=ProgramRunState,
    summary="Stop a running program",
)
async def stop_run(run_id: str, svc: Service) -> ProgramRunState:
    try:
        return await svc.programs.stop_run(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# ─── WebSocket — live run updates ────────────────────────────────────────────


@router.websocket("/runs/{run_id}/ws")
async def run_ws(run_id: str, websocket: WebSocket) -> None:
    """
    Stream program run state transitions in real time.

    On connect: sends a snapshot of the current run state, then streams every
    subsequent update.  Slow consumers drop frames (queue full → discard).
    """
    svc: BrainService = websocket.app.state.brain

    run = svc.programs.get_run(run_id)
    if run is None:
        await websocket.close(code=4404)
        return

    await websocket.accept()

    # Initial snapshot for recovery
    await websocket.send_text(run.model_dump_json())

    topic = f"programs/runs/{run_id}"
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
            state = ProgramRunState(**{
                k: v for k, v in event.items() if k not in ("type", "topic")
            })
            await websocket.send_text(state.model_dump_json())
    except WebSocketDisconnect:
        pass
    finally:
        svc.observability._event_queues[:] = [  # type: ignore[attr-defined]
            q for q in svc.observability._event_queues  # type: ignore[attr-defined]
            if not isinstance(q, _CallbackQueue) or q._cb is not on_event
        ]


class _CallbackQueue:
    """
    Shim that satisfies the ObservabilityService's list[asyncio.Queue] contract
    while routing events through a filter callback.
    """

    def __init__(self, cb):
        self._cb = cb

    def put_nowait(self, event: dict) -> None:  # noqa: D401
        self._cb(event)
