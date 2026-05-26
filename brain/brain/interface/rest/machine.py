from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from brain.interface.rest.deps import get_service
from brain.models.machine import Machine, MachineDescription
from brain.service.service import BrainService

router = APIRouter(prefix="/machine", tags=["machine"])

Service = Annotated[BrainService, Depends(get_service)]


@router.get("", response_model=Machine)
async def get_machine(machine_id: str, svc: Service) -> Machine:
    """Return the current bound machine description."""
    machine = await svc.machine.get_machine(machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id!r} not found")
    return machine


@router.get("", response_model=list[str])
async def list_machines(svc: Service) -> list[str]:
    """Return all known machine IDs."""
    return await svc.machine.list_machines()


@router.put("", response_model=Machine)
async def build_machine(description: MachineDescription, svc: Service) -> Machine:
    """Build and bind a machine from a template description."""
    return await svc.machine.build_machine(description)


@router.post("/{machine_id}/bind")
async def bind_actuators(machine_id: str, actuator_ids: list[str], svc: Service) -> dict:
    """Bind a list of actuator IDs to the machine's joint slots (index = slot)."""
    await svc.machine.bind_actuators(machine_id, actuator_ids)
    return {"machine_id": machine_id, "bound": actuator_ids}


@router.post("/{machine_id}/home")
async def home_machine(machine_id: str, svc: Service) -> dict:
    """Send the machine to its home configuration."""
    await svc.motion.go_home(machine_id)
    return {"machine_id": machine_id, "status": "homing"}
