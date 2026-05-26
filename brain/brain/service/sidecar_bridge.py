from brain.models.actuator import Actuator
from brain.models.motion import ActuatorTrajectorySegment
from brain.models.state import JointState
from brain.utils.config import Config
from brain.utils.logger import logger


class SidecarBridge:
    """
    Manages the gRPC connection to the Rust sidecar over a Unix socket.
    The sidecar owns the critical path: transport, discovery, watchdog,
    E-stop fan-out, and aggregated joint-state streaming.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._connected = False

    async def connect(self) -> None:
        logger.info("Connecting to sidecar at %s", self._config.sidecar_socket)
        # TODO: open gRPC channel to self._config.sidecar_socket
        self._connected = True

    async def disconnect(self) -> None:
        logger.info("Disconnecting from sidecar")
        # TODO: close gRPC channel
        self._connected = False

    async def list_actuators(self) -> list[Actuator]:
        """Return actuators discovered by the sidecar."""
        # TODO: call sidecar.ListActuators RPC
        return []

    async def send_trajectory_segments(self, segments: list[ActuatorTrajectorySegment]) -> None:
        """
        Hand per-actuator trajectory segments to the sidecar with a common
        start_time so all joints begin motion synchronously.
        """
        # TODO: call sidecar.SendTrajectory RPC
        logger.debug("Sending %d trajectory segments to sidecar", len(segments))

    async def subscribe_joint_states(self, callback: object) -> None:
        """
        Open a server-streaming RPC and call *callback* with each
        aggregated JointState batch received from the sidecar.
        """
        # TODO: open sidecar.StreamJointStates RPC and drive callback
        logger.debug("Subscribing to sidecar joint-state stream")

    async def estop(self) -> None:
        """Fan-out E-stop to all actuators via the sidecar's critical path."""
        logger.warning("E-stop sent to sidecar")
        # TODO: call sidecar.EStop RPC

    async def calibrate_actuator(self, actuator_id: str) -> dict[str, object]:
        """Trigger per-actuator calibration and return results."""
        logger.info("Calibrating actuator %s via sidecar", actuator_id)
        # TODO: call sidecar.CalibrateActuator RPC
        return {}

    async def get_raw_joint_states(self) -> list[JointState]:
        """One-shot snapshot of the current aggregated joint states."""
        # TODO: call sidecar.GetJointStates RPC
        return []
