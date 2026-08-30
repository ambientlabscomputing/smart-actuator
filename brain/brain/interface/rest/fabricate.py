from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from brain.interface.rest.deps import get_service
from brain.models.fabricate import (
    FabricateStatus,
    PairingState,
    PreparedSnapshot,
    PrepareSnapshotRequest,
)
from brain.service.fabricate_service import FabricateService
from brain.service.service import BrainService

router = APIRouter(prefix="/fabricate", tags=["fabricate"])
Service = Annotated[BrainService, Depends(get_service)]


def bridge(svc: BrainService) -> FabricateService:
    if svc.fabricate is None:
        raise HTTPException(status_code=503, detail="Fabricate bridge is unavailable")
    return svc.fabricate


class PairRequest(BaseModel):
    name: str = Field(default="Jog deployment", min_length=1, max_length=200)


@router.get("/status", response_model=FabricateStatus)
async def status(svc: Service) -> FabricateStatus:
    return await bridge(svc).status()


@router.post("/pairing", response_model=PairingState)
async def begin_pairing(payload: PairRequest, svc: Service) -> PairingState:
    try:
        return await bridge(svc).begin_pairing(payload.name)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/pairing/poll")
async def poll_pairing(svc: Service) -> dict[str, Any]:
    try:
        return await bridge(svc).poll_pairing()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/identity/rotate")
async def rotate(svc: Service) -> dict[str, Any]:
    try:
        return (await bridge(svc).rotate()).model_dump(mode="json")
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/identity")
async def reset(svc: Service) -> dict[str, Any]:
    return await bridge(svc).reset()


@router.post("/snapshots/prepare", response_model=PreparedSnapshot)
async def prepare(payload: PrepareSnapshotRequest, svc: Service) -> PreparedSnapshot:
    try:
        return await bridge(svc).prepare_snapshot(payload.machine_id, payload.attachment_ids)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/snapshots/{digest}/send")
async def send(digest: str, svc: Service) -> dict[str, Any]:
    try:
        return await bridge(svc).send_snapshot(digest)
    except (RuntimeError, ValueError, httpx.HTTPError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/releases")
async def releases(svc: Service) -> list[dict[str, Any]]:
    try:
        return await bridge(svc).releases()
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/releases/{release_id}/download")
async def download_release(release_id: str, svc: Service) -> dict[str, Any]:
    try:
        return await bridge(svc).download_release(release_id)
    except (RuntimeError, ValueError, httpx.HTTPError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
