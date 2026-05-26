from brain.models.state import MachineMode, MachineState
from brain.utils.config import Config
from brain.utils.logger import logger


class RosGateway:
    """
    ROS 2 interface adapter (C9).

    Joint semantics (names, frames) live with the URDF, so the ROS bridge
    belongs in the Brain. Publishes joint states, TF, and machine metadata;
    subscribes to command topics; optionally exposes action servers and services.

    This is an interface adapter — it lives in brain.interface, not brain.service.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._running = False

    async def start(self) -> None:
        """Initialise the ROS 2 node and set up publishers / subscribers."""
        logger.info("Starting ROS gateway")
        # TODO: rclpy.init(), create Node, create publishers and subscribers
        self._running = True

    async def stop(self) -> None:
        """Shut down the ROS 2 node cleanly."""
        logger.info("Stopping ROS gateway")
        # TODO: rclpy.shutdown()
        self._running = False

    def publish_joint_states(self, state: MachineState) -> None:
        """Publish sensor_msgs/JointState from the machine's measured state."""
        if not self._running:
            return
        # TODO: build JointState message and call publisher.publish()

    def publish_tf(self, state: MachineState) -> None:
        """Publish TF transforms derived from the machine's modeled (FK) state."""
        if not self._running:
            return
        # TODO: build TransformStamped messages and broadcast via tf2_ros

    def publish_robot_description(self, urdf: str) -> None:
        """Publish the expanded URDF on /robot_description (latched)."""
        if not self._running:
            return
        # TODO: publish String message on /robot_description

    def publish_machine_mode(self, machine_id: str, mode: MachineMode) -> None:
        """Publish the current operating mode on /machine/mode."""
        if not self._running:
            return
        # TODO: publish custom mode message
