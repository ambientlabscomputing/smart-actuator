from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.machine import Machine, MachineDescription
from brain.service.service import BrainService

router = APIRouter(prefix="/machine", tags=["machine"])

Service = Annotated[BrainService, Depends(get_service)]


# ── List all machines ──────────────────────────────────────────────────────────

@router.get("s", response_model=list[str], summary="List all machine IDs")
async def list_machines(svc: Service) -> list[str]:
    """Return the IDs of all persisted machines."""
    return await svc.machine.list_machines()


# ── Get a single machine ───────────────────────────────────────────────────────

@router.get("/{machine_id}", response_model=Machine, summary="Get machine by ID")
async def get_machine(machine_id: str, svc: Service) -> Machine:
    """Return the current bound machine description."""
    machine = await svc.machine.get_machine(machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id!r} not found")
    return machine


# ── Create / rebuild a machine ─────────────────────────────────────────────────

@router.post("", response_model=Machine, status_code=201, summary="Build machine from description")
async def build_machine(description: MachineDescription, svc: Service) -> Machine:
    """
    Create or replace a machine from a template description.
    The template is expanded to URDF and persisted immediately.
    Actuator slots start unbound — follow up with POST /machine/{id}/bindings/{slot}.
    """
    return await svc.machine.build_machine(description)


# ── Bind a single slot ────────────────────────────────────────────────────────

class BindingRequest(BaseModel):
    kind: str  # "sim" | "unbound"


class UpdateParametersRequest(BaseModel):
    parameters: dict[str, float]


@router.post(
    "/{machine_id}/bindings/{slot}",
    summary="Bind a joint slot to a sim (or unbind)",
)
async def bind_slot(
    machine_id: str, slot: int, body: BindingRequest, svc: Service
) -> dict:
    """
    Bind slot *slot* of machine *machine_id*.

    - `kind="sim"` — spawn an actuator-sim process, register with Sidecar,
      return {machine_id, slot, kind, actuator_id, address, pid}.
    - `kind="unbound"` — tear down any existing sim for this slot.
    """
    try:
        return await svc.machine.bind_slot(machine_id, slot, kind=body.kind)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Legacy: bind a complete ordered list of actuator IDs ──────────────────────

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


# ── Update machine parameters ─────────────────────────────────────────────────

@router.patch(
    "/{machine_id}",
    response_model=Machine,
    summary="Update machine geometry parameters",
)
async def update_parameters(
    machine_id: str, body: UpdateParametersRequest, svc: Service
) -> Machine:
    """
    Update one or more geometry parameters on an existing machine.

    Values are validated against the template schema (min/max).
    Actuator bindings are preserved; the URDF is re-expanded automatically.
    Sims are NOT restarted — link length / limit changes are visual in J3.
    """
    try:
        return await svc.machine.update_parameters(machine_id, body.parameters)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
