import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.machine import (
    DHChainValues,
    EndEffectorSpec,
    IKNumericConfig,
    IKOverrides,
    Machine,
    MachineDescription,
    WorkspaceResult,
)
from brain.models.motion import Pose
from brain.service.ik import IKCallOptions, IKNoSolution, IKUnreachable
from brain.service.service import BrainService

logger = logging.getLogger(__name__)

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
async def build_machine(description: MachineDescription, svc: Service, request: Request) -> Machine:
    """
    Create or replace a machine from a template description.
    The template is expanded to URDF and persisted immediately.
    Actuator slots start unbound — follow up with POST /machine/{id}/bindings/{slot}.
    """
    return await svc.machine.build_machine(description, created_by=request.state.user.username)


# ── Bind a single slot ────────────────────────────────────────────────────────


class BindingRequest(BaseModel):
    kind: str  # "sim" | "hardware" | "unbound"
    # Hardware via TCP (legacy WiFi or Ethernet)
    ip: str | None = None
    port: int | None = None
    # Hardware via USB-CDC / serial
    serial_path: str | None = None
    baud_rate: int = 921_600
    # Optional — derived from machine_id + slot if omitted
    actuator_id: str | None = None


class UpdateParametersRequest(BaseModel):
    parameters: dict[str, float] = {}
    dh_chain: DHChainValues | None = None


@router.post(
    "/{machine_id}/bindings/{slot}",
    summary="Bind a joint slot to a sim or hardware actuator (or unbind)",
)
async def bind_slot(
    machine_id: str, slot: int, body: BindingRequest, svc: Service, request: Request
) -> dict:
    """
    Bind slot *slot* of machine *machine_id*.

    - `kind="sim"` — spawn an actuator-sim process, register with Sidecar,
      return {machine_id, slot, kind, actuator_id, address, pid}.
    - `kind="hardware"` — register an existing hardware actuator (e.g. ESP32
      firmware) by its IP and port. Fields: ip (required), port (required),
      actuator_id (optional, derived if omitted).
      Returns {machine_id, slot, kind, actuator_id, address}.
    - `kind="unbound"` — tear down any existing binding for this slot.
    """
    if body.kind == "hardware":
        if not body.ip and not body.serial_path:
            raise HTTPException(
                status_code=422,
                detail=(
                    "kind='hardware' requires either 'ip'+'port' (TCP) or 'serial_path' (USB-CDC)"
                ),
            )
    try:
        return await svc.machine.bind_slot(
            machine_id,
            slot,
            kind=body.kind,
            ip=body.ip,
            port=body.port,
            serial_path=body.serial_path,
            baud_rate=body.baud_rate,
            actuator_id=body.actuator_id,
            created_by=request.state.user.username,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Legacy: bind a complete ordered list of actuator IDs ──────────────────────


@router.post("/{machine_id}/bind")
async def bind_actuators(
    machine_id: str, actuator_ids: list[str], svc: Service, request: Request
) -> dict:
    """Bind a list of actuator IDs to the machine's joint slots (index = slot)."""
    await svc.machine.bind_actuators(
        machine_id, actuator_ids, created_by=request.state.user.username
    )
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
    machine_id: str, body: UpdateParametersRequest, svc: Service, request: Request
) -> Machine:
    """
    Update one or more geometry parameters on an existing machine.

    Values are validated against the template schema (min/max).
    Actuator bindings are preserved; the URDF is re-expanded automatically.
    Sims are NOT restarted — link length / limit changes are visual in J3.
    """
    try:
        return await svc.machine.update_parameters(
            machine_id,
            body.parameters or None,
            dh_chain=body.dh_chain,
            created_by=request.state.user.username,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Workspace endpoints ───────────────────────────────────────────────────────


@router.get(
    "/{machine_id}/workspace",
    response_model=WorkspaceResult,
    summary="Get the machine's pre-computed reachable workspace",
)
async def get_workspace(machine_id: str, svc: Service) -> WorkspaceResult:
    """
    Return the cached reachable end-effector workspace for the machine.
    The workspace is computed eagerly when the machine is created or edited,
    so this endpoint is a fast read of the persisted result.
    Returns 404 if not yet computed (e.g. legacy machine without dh_chain).
    """
    result = await svc.workspace.get(machine_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Workspace not yet computed for machine {machine_id!r}. "
            "POST /machine/{id}/workspace/recompute to generate it.",
        )
    return result


@router.post(
    "/{machine_id}/workspace/recompute",
    response_model=WorkspaceResult,
    summary="Force-recompute the machine's reachable workspace",
)
async def recompute_workspace(machine_id: str, svc: Service, request: Request) -> WorkspaceResult:
    """
    Recompute the reachable workspace from the machine's current DH chain
    and persist the result.  Useful after direct DB edits or to force a refresh.
    """
    try:
        return await svc.workspace.recompute(machine_id, created_by=request.state.user.username)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class ContainsRequest(BaseModel):
    point: list[float]  # [x, y, z] in metres


@router.post(
    "/{machine_id}/workspace/contains",
    summary="Check if a 3-D point is within the machine's reachable workspace",
)
async def workspace_contains(machine_id: str, body: ContainsRequest, svc: Service) -> dict:
    """
    Return {inside: bool} indicating whether *point* lies within the machine's
    reachable end-effector envelope.  Uses the persisted convex hull.
    """
    if len(body.point) != 3:
        raise HTTPException(status_code=422, detail="point must be [x, y, z] (3 floats)")
    inside = await svc.workspace.contains(machine_id, (body.point[0], body.point[1], body.point[2]))
    return {"machine_id": machine_id, "point": body.point, "inside": inside}


# ── IK endpoints ───────────────────────────────────────────────────────────────


class IKOverridesRequest(BaseModel):
    force_numeric: bool = False
    numeric: IKNumericConfig | None = None


class EndEffectorRequest(BaseModel):
    parent: str = ""
    offset_m: list[float] = [0.0, 0.0, 0.0]
    orientation_offset_deg: list[float] = [0.0, 0.0, 0.0]
    task_space: str = "r3"


class IKPreviewRequest(BaseModel):
    target_pose: Pose
    strategy: str = "auto"
    branch_preference: str = ""
    seed: list[float] = []


class IKPreviewResponse(BaseModel):
    machine_id: str
    solved_q: list[float]
    residual_m: float
    strategy_used: str
    elapsed_ms: float
    # Collision-related fields
    collision_blocked: bool = False
    collision_resolved: bool = False
    resolved_branch: str | None = None
    requires_reconfig: bool = False


@router.put(
    "/{machine_id}/ik_overrides",
    response_model=Machine,
    summary="Set IK solver overrides (force-numeric, numeric tuning)",
)
async def set_ik_overrides(
    machine_id: str, body: IKOverridesRequest, svc: Service, request: Request
) -> Machine:
    """
    Persist per-machine IK override settings.
    Setting force_numeric=true bypasses analytic solvers entirely.
    """
    machine = await svc.machine.get_machine(machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id!r} not found")
    overrides = IKOverrides(force_numeric=body.force_numeric, numeric=body.numeric)
    return await svc.machine.set_ik_overrides(
        machine_id, overrides, updated_by=request.state.user.username
    )


@router.put(
    "/{machine_id}/end_effector",
    response_model=Machine,
    summary="Update the end-effector frame definition",
)
async def set_end_effector(
    machine_id: str, body: EndEffectorRequest, svc: Service, request: Request
) -> Machine:
    """
    Update the EE offset/orientation and task-space declaration.
    Changing the EE frame invalidates the cached workspace and triggers a
    background recompute.
    """
    machine = await svc.machine.get_machine(machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id!r} not found")
    ee = EndEffectorSpec(
        parent=body.parent,
        offset_m=body.offset_m,
        orientation_offset_deg=body.orientation_offset_deg,
        task_space=body.task_space,
    )
    updated = await svc.machine.set_end_effector(
        machine_id, ee, updated_by=request.state.user.username
    )
    # Invalidate workspace so it recomputes on next access
    await svc.workspace.invalidate(machine_id)
    return updated


@router.post(
    "/{machine_id}/ik/preview",
    response_model=IKPreviewResponse,
    summary="Preview IK solution for a target pose",
)
async def ik_preview(machine_id: str, body: IKPreviewRequest, svc: Service) -> IKPreviewResponse:
    """
    Compute joint angles that achieve the requested pose without executing any
    motion.  Returns the solved configuration, position residual, and the
    strategy actually used (analytic or numeric).

    Raises 404 if the machine is unknown, 422 if the target is outside the
    workspace, and 409 if the solver cannot find a solution.
    """
    import time

    machine = await svc.machine.get_machine(machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id!r} not found")

    opts = IKCallOptions(
        strategy=body.strategy,
        branch_preference=body.branch_preference,
        seed=body.seed,
    )

    t0 = time.monotonic()
    try:
        solved_q = await svc.kinematics.inverse_kinematics(
            machine_id, body.target_pose, options=opts
        )
    except IKUnreachable as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IKNoSolution as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    elapsed_ms = (time.monotonic() - t0) * 1000.0

    # Compute residual post-hoc
    dh = machine.description.dh_chain
    ee = machine.description.end_effector
    residual_m = 0.0
    if dh and solved_q:
        import math

        from brain.service.dh_fk import ee_position_with_spec

        x, y, z = ee_position_with_spec(dh, solved_q, ee)
        pos = body.target_pose.position
        residual_m = math.sqrt((x - pos[0]) ** 2 + (y - pos[1]) ** 2 + (z - pos[2]) ** 2)

    strategy_used = (
        "numeric"
        if (machine.description.ik_overrides and machine.description.ik_overrides.force_numeric)
        else body.strategy
    )

    # Check for collisions with floor — always run this so we can resolve branch if needed
    collision_blocked = False
    collision_resolved = False
    resolved_branch = None
    requires_reconfig = False

    try:
        result = await svc.safety.solve_clear_of_floor(
            machine_id,
            body.target_pose,
            seed=body.seed,
            strategy=body.strategy,
            branch_preference=body.branch_preference,
        )

        collision_blocked = result["blocked"]
        collision_resolved = not result["blocked"] and result["resolved_branch"] is not None
        resolved_branch = result["resolved_branch"]
        requires_reconfig = result["requires_reconfig"]

        # If a collision-free branch was found, use its joint angles
        if not collision_blocked and result["q"]:
            solved_q = result["q"]

    except Exception as e:
        logger.warning(f"Failed to check collision in IK preview: {e}")

    return IKPreviewResponse(
        machine_id=machine_id,
        solved_q=solved_q,
        residual_m=residual_m,
        strategy_used=strategy_used,
        elapsed_ms=elapsed_ms,
        collision_blocked=collision_blocked,
        collision_resolved=collision_resolved,
        resolved_branch=resolved_branch,
        requires_reconfig=requires_reconfig,
    )
