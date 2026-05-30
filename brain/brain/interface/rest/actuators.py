from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from brain.interface.rest.deps import get_service
from brain.models.actuator import Actuator
from brain.models.calibration import CalibrationJobState
from brain.service.service import BrainService

router = APIRouter(prefix="/actuators", tags=["actuators"])

Service = Annotated[BrainService, Depends(get_service)]


@router.get("", response_model=list[Actuator])
async def list_actuators(svc: Service) -> list[Actuator]:
    """Return all actuators currently visible to the sidecar."""
    return await svc.actuators.list_discovered()


@router.get("/{actuator_id}", response_model=Actuator)
async def describe_actuator(actuator_id: str, svc: Service) -> Actuator:
    """Return details for a single actuator."""
    actuator = await svc.actuators.describe(actuator_id)
    if actuator is None:
        raise HTTPException(status_code=404, detail=f"Actuator {actuator_id!r} not found")
    return actuator


@router.post("/{actuator_id}/calibrate", response_model=CalibrationJobState, status_code=201)
async def calibrate_actuator(
    actuator_id: str, machine_id: str, joint_index: int, svc: Service, request: Request
) -> CalibrationJobState:
    """Start a calibration job for the given actuator joint."""
    try:
        return await svc.calibration.start_job(
            machine_id, joint_index, created_by=request.state.user.username
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
