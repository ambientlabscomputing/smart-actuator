"""
gRPC servicer — maps every Brain proto RPC to the corresponding service call.

Once brain_pb2 / brain_pb2_grpc are generated, uncomment the import at the
top of this file and the base-class inheritance on BrainServicer.  The method
stubs are already written and ready to wire up.
"""

from __future__ import annotations

# from brain.interface.grpc.generated import brain_pb2, brain_pb2_grpc  # noqa: ERA001
import grpc

from brain.service.service import BrainService


class BrainServicer:
    """
    gRPC servicer — one method per RPC defined in brain.proto.

    Inherits from brain_pb2_grpc.BrainServiceServicer once generated.
    All methods receive a proto request and a grpc.aio.ServicerContext.
    """

    def __init__(self, service: BrainService) -> None:
        self._svc = service

    # ── Actuators ──────────────────────────────────────────────────────────

    async def ListActuators(self, request: object, context: grpc.aio.ServicerContext) -> object:
        actuators = await self._svc.actuators.list_discovered()
        # TODO: map actuators → ListActuatorsResponse proto
        return NotImplemented

    async def DescribeActuator(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: req.actuator_id → DescribeActuatorResponse
        return NotImplemented

    async def CalibrateActuator(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.calibration.calibrate_actuator(req.machine_id, req.actuator_id)
        return NotImplemented

    async def SetActuatorLimit(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.actuators.set_limit(req.actuator_id, req.limit_name, req.value)
        return NotImplemented

    # ── Machine ────────────────────────────────────────────────────────────

    async def ListMachines(self, request: object, context: grpc.aio.ServicerContext) -> object:
        ids = await self._svc.machine.list_machines()
        # TODO: → ListMachinesResponse(machine_ids=ids)
        return NotImplemented

    async def GetMachine(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.machine.get_machine(req.machine_id) → GetMachineResponse
        return NotImplemented

    async def BuildMachine(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: deserialise req.parameters JSON, call svc.machine.build_machine(...)
        return NotImplemented

    async def BindActuators(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.machine.bind_actuators(req.machine_id, list(req.actuator_ids))
        return NotImplemented

    async def HomeMachine(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.motion.go_home(req.machine_id)
        return NotImplemented

    # ── Mode ───────────────────────────────────────────────────────────────

    async def GetMode(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.lifecycle.get_mode(req.machine_id) → GetModeResponse
        return NotImplemented

    async def SetMode(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.lifecycle.request_mode(req.machine_id, MachineMode(req.mode), req.reason)
        return NotImplemented

    async def GetModeHistory(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.lifecycle.get_mode_history(req.machine_id) → GetModeHistoryResponse
        return NotImplemented

    async def WatchMode(self, request: object, context: grpc.aio.ServicerContext):  # type: ignore[return]
        """Server-streaming: push ModeEvent messages as mode transitions occur."""
        # TODO: register a lifecycle subscriber; yield ModeEvent protos until context is done
        import asyncio

        while not context.done():
            await asyncio.sleep(1)  # placeholder — replace with real subscriber loop

    # ── Motion ─────────────────────────────────────────────────────────────

    async def MoveJoint(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: build joint_targets dict from req.targets, call svc.motion.move_joint
        return NotImplemented

    async def MoveLinear(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.motion.move_linear(req.machine_id, Pose(...))
        return NotImplemented

    async def MoveToPose(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.motion.move_to_pose(req.machine_id, Pose(...))
        return NotImplemented

    async def FollowPath(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.motion.follow_path(req.machine_id, [Pose(...) for p in req.waypoints])
        return NotImplemented

    async def HoldPose(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.motion.hold_pose(req.machine_id)
        return NotImplemented

    async def Stop(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.motion.abort(req.machine_id)
        return NotImplemented

    async def EStop(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.safety.estop(req.machine_id)
        return NotImplemented

    # ── Programs ───────────────────────────────────────────────────────────

    async def ListPrograms(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.programs.list_programs() → ListProgramsResponse
        return NotImplemented

    async def GetProgram(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.programs.load_program(req.program_id) → GetProgramResponse(ast_json=...)
        return NotImplemented

    async def SaveProgram(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: deserialise req.ast_json, call svc.programs.save_program(program)
        return NotImplemented

    async def DeleteProgram(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.programs.delete_program(req.program_id)
        return NotImplemented

    async def RunProgram(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.programs.run_program(req.program_id, req.machine_id)
        return NotImplemented

    async def PauseProgram(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.programs.pause_program(req.program_id)
        return NotImplemented

    async def ResumeProgram(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.programs.resume_program(req.program_id)
        return NotImplemented

    async def AbortProgram(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.programs.abort_program(req.program_id)
        return NotImplemented

    # ── State ──────────────────────────────────────────────────────────────

    async def GetState(self, request: object, context: grpc.aio.ServicerContext) -> object:
        # TODO: svc.state.get_measured_state(req.machine_id) → GetStateResponse
        return NotImplemented

    async def WatchState(self, request: object, context: grpc.aio.ServicerContext):  # type: ignore[return]
        """Server-streaming: push StateUpdate messages as joint state changes."""
        # TODO: register a state subscriber; yield StateUpdate protos until context is done
        import asyncio

        while not context.done():
            await asyncio.sleep(1)  # placeholder — replace with real subscriber loop
