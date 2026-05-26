from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from brain.interface.rest.deps import get_service
from brain.models.motion import Pose
from brain.service.service import BrainService

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
    await svc.motion.move_joint(body.machine_id, body.joint_targets)
    return {"status": "executing"}


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
    """Trigger an emergency stop. Fan-out is handled by the sidecar."""
    await svc.safety.estop(machine_id)
    return {"status": "estopped"}
