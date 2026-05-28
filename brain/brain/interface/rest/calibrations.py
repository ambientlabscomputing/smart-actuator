import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.calibration import CalibrationJobState
from brain.service.service import BrainService

router = APIRouter(tags=["calibrations"])

Service = Annotated[BrainService, Depends(get_service)]


class StartCalibrationRequest(BaseModel):
    joint_index: int


# ── Start a calibration job ────────────────────────────────────────────────────

@router.post(
    "/machines/{machine_id}/calibrations",
    response_model=CalibrationJobState,
    status_code=201,
    summary="Start a calibration job for a joint",
)
async def start_calibration(
    machine_id: str, body: StartCalibrationRequest, svc: Service
) -> CalibrationJobState:
    try:
        return await svc.calibration.start_job(machine_id, body.joint_index)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# ── List calibration jobs for a machine ───────────────────────────────────────

@router.get(
    "/machines/{machine_id}/calibrations",
    response_model=list[CalibrationJobState],
    summary="List calibration jobs for a machine",
)
async def list_calibrations(machine_id: str, svc: Service) -> list[CalibrationJobState]:
    return svc.calibration.list_jobs(machine_id)


# ── Get a single calibration job ──────────────────────────────────────────────

@router.get(
    "/calibrations/{job_id}",
    response_model=CalibrationJobState,
    summary="Get calibration job state",
)
async def get_calibration(job_id: str, svc: Service) -> CalibrationJobState:
    job = svc.calibration.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Calibration job {job_id!r} not found")
    return job


# ── Advance a job ─────────────────────────────────────────────────────────────

@router.post(
    "/calibrations/{job_id}/advance",
    response_model=CalibrationJobState,
    summary="Advance a calibration job to the next step",
)
async def advance_calibration(job_id: str, svc: Service) -> CalibrationJobState:
    try:
        return await svc.calibration.advance_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# ── Abort a job ───────────────────────────────────────────────────────────────

@router.post(
    "/calibrations/{job_id}/abort",
    response_model=CalibrationJobState,
    summary="Abort a calibration job",
)
async def abort_calibration(job_id: str, svc: Service) -> CalibrationJobState:
    try:
        return await svc.calibration.abort_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# ── WebSocket — live job updates ──────────────────────────────────────────────

@router.websocket("/calibrations/{job_id}/ws")
async def calibration_ws(job_id: str, websocket: WebSocket) -> None:
    """
    Stream calibration job state transitions in real time.

    On connect: sends a snapshot of the current job state, then streams every
    subsequent update.  Slow consumers drop frames (queue full → discard).
    """
    svc: BrainService = websocket.app.state.brain

    job = svc.calibration.get_job(job_id)
    if job is None:
        await websocket.close(code=4404)
        return

    await websocket.accept()

    # Send initial snapshot so the client can recover mid-job
    await websocket.send_text(job.model_dump_json())

    topic = f"calibrations/{job_id}"
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
            state = CalibrationJobState(**{
                k: v for k, v in event.items() if k != "type" and k != "topic"
            })
            await websocket.send_text(state.model_dump_json())
    except WebSocketDisconnect:
        pass
    finally:
        # Remove our pseudo-queue shim from the observability list
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
