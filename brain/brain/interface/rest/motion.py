from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.motion import Pose
from brain.models.state import MachineMode
from brain.service.service import BrainService
from brain.utils.logger import logger

router = APIRouter(prefix="/move", tags=["motion"])

Service = Annotated[BrainService, Depends(get_service)]


class MoveJointBody(BaseModel):
    machine_id: str
    joint_targets: dict[str, float]


class MovePoseBody(BaseModel):
    machine_id: str
    pose: Pose


class FollowPathBody(BaseModel):
    machine_id: str
    waypoints: list[Pose]


@router.post("/joint")
async def move_joint(body: MoveJointBody, svc: Service) -> dict:
    """Move one or more joints to target angles (radians)."""
    mode = svc.lifecycle.get_mode(body.machine_id)

    # Auto-transition OFFLINE → IDLE (sidecar may not have sent its first frame yet)
    # then IDLE → MANUAL on first jog.
    if mode == MachineMode.OFFLINE:
        await svc.lifecycle.request_mode(body.machine_id, MachineMode.IDLE, "jog from offline")
        mode = MachineMode.IDLE
    if mode == MachineMode.IDLE:
        await svc.lifecycle.request_mode(body.machine_id, MachineMode.MANUAL, "jog started")
        mode = MachineMode.MANUAL

    if not svc.safety.gate_capability(mode, "move_joint"):
        raise HTTPException(
            status_code=409,
            detail={"mode": mode, "reason": f"move_joint not permitted in mode '{mode}'"},
        )

    # Defense-in-depth floor collision check.
    # Build the full configuration vector (DH order) from current state merged
    # with the requested targets, then check against the constraint.
    try:
        machine = await svc.machine.get_machine(body.machine_id)
        if machine and machine.description.dh_chain:
            joint_names = [j.name for j in machine.description.dh_chain.joints]
            # Current positions for joints not in the target set
            current_state = svc.state.get_measured_state(body.machine_id)
            current_pos: dict[str, float] = {}
            if current_state:
                current_pos = {js.joint_name: js.position for js in current_state.measured}
            # Merge: start from current, override with incoming targets
            full_q = [
                body.joint_targets.get(name, current_pos.get(name, 0.0)) for name in joint_names
            ]
            collision = await svc.safety.check_configuration(body.machine_id, full_q)
            if not collision.ok:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "reason": "floor_collision",
                        "message": collision.message,
                        "position": collision.position,
                        "depth_m": collision.depth_m,
                    },
                )
    except HTTPException:
        raise  # never swallow 409s
    except Exception as exc:
        # Non-fatal: log and allow the move rather than block on an internal error.
        logger.warning("move_joint: collision pre-check failed (non-blocking): %s", exc)

    await svc.motion.move_joint(body.machine_id, body.joint_targets)
    return {"status": "executing", "mode": mode}


@router.post("/linear")
async def move_linear(body: MovePoseBody, svc: Service) -> dict:
    """Move end-effector in a straight Cartesian line to the target pose."""
    await svc.motion.move_linear(body.machine_id, body.pose)
    return {"status": "executing"}


@router.post("/pose")
async def move_to_pose(body: MovePoseBody, svc: Service) -> dict:
    """Move to a Cartesian target pose via a joint-space path."""
    await svc.motion.move_to_pose(body.machine_id, body.pose)
    return {"status": "executing"}


@router.post("/path")
async def follow_path(body: FollowPathBody, svc: Service) -> dict:
    """Follow a sequence of Cartesian waypoints."""
    await svc.motion.follow_path(body.machine_id, body.waypoints)
    return {"status": "executing"}


@router.post("/stop")
async def stop(machine_id: str, svc: Service) -> dict:
    """Abort the current trajectory and decelerate to a stop."""
    await svc.motion.abort(machine_id)
    return {"status": "stopped"}


@router.post("/estop")
async def estop(machine_id: str, svc: Service) -> dict:
    """
    Emergency stop.  Flips mode to ESTOPPED first (gates further commands),
    then fans out Abort to all actuators via the sidecar.
    Recovery requires POST /mode {mode: 'idle'}.
    """
    await svc.safety.estop(machine_id)
    return {"status": "estopped", "mode": MachineMode.ESTOPPED}
