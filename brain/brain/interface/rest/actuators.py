from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from brain.interface.rest.deps import get_service
from brain.models.actuator import Actuator
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


@router.post("/{actuator_id}/calibrate")
async def calibrate_actuator(actuator_id: str, machine_id: str, svc: Service) -> dict:
    """Trigger per-actuator calibration and return the result."""
    result = await svc.calibration.calibrate_actuator(machine_id, actuator_id)
    return {"actuator_id": actuator_id, "result": result}
