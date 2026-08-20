import math

import cadquery
from cadquery import Location, Vector
from machinewright import CADAssembly, attach, register_assembly
from machinewright.lib.fasteners import SHOULDER_BOLT_SPECS, ScrewSize
from machinewright.lib.materials import MATERIALS
from machinewright.objects.box import Box

from cad.objects.shell.shell_body import ShellBody
from cad.objects.shell.shell_lid import _SENSOR_POCKET_DEPTH, ShellLid

_MOUNT_CLEARANCE = 0.4
_SENSOR_BOARD_THICKNESS = 1.6  # typical PCB thickness; verify against the actual breakout you buy


@register_assembly
class ShellAssembly(CADAssembly):
    """
    Cylindrical shell wrapping a gearbox stack. Decoupled from any
    specific gearbox -- takes the mating dimensions as plain params
    (mount diameter, bolt circle, tube length) rather than a
    `NemaSize`, the same way `RingHousing` doesn't know about
    `CycloidalDisc`. `ActuatorAssembly` is what bridges the two,
    reading these numbers off a `CycloidalGearboxAssembly` instance --
    including `sensor_mount_radius` and `sensor_mount_angle`, so the
    lid's encoder sensor board lines up with OutputFlange's target ring
    on the other side of the assembly gap, at an angle clear of the
    gearbox's own roller pin bolt heads.
    """

    def __init__(
        self,
        mount_diameter: float,
        mount_bolt_circle_diameter: float,
        num_mount_bolts: int,
        tube_length: float,
        wall_thickness: float,
        lid_thickness: float,
        thread_size: ScrewSize,
        output_clearance_diameter: float,
        pod_width: float,
        pod_height: float,
        pod_depth: float,
        pod_center_z: float,
        pod_bolt_circle_diameter: float,
        num_pod_bolts: int,
        sensor_mount_radius: float,
        sensor_mount_angle: float,
        sensor_board_width: float,
        sensor_board_length: float,
        sensor_hole_inset: float,
        sensor_thread_size: ScrewSize,
    ):
        self.mount_diameter = mount_diameter
        self.mount_bolt_circle_diameter = mount_bolt_circle_diameter
        self.num_mount_bolts = num_mount_bolts
        self.tube_length = tube_length
        self.wall_thickness = wall_thickness
        self.lid_thickness = lid_thickness
        self.thread_size = thread_size
        self.output_clearance_diameter = output_clearance_diameter
        self.pod_width = pod_width
        self.pod_height = pod_height
        self.pod_depth = pod_depth
        self.pod_center_z = pod_center_z
        self.pod_bolt_circle_diameter = pod_bolt_circle_diameter
        self.num_pod_bolts = num_pod_bolts
        self.sensor_mount_radius = sensor_mount_radius
        self.sensor_mount_angle = sensor_mount_angle
        self.sensor_board_width = sensor_board_width
        self.sensor_board_length = sensor_board_length
        self.sensor_hole_inset = sensor_hole_inset
        self.sensor_thread_size = sensor_thread_size

    def _shell_body(self) -> ShellBody:
        return ShellBody(
            outer_diameter=self.mount_diameter,
            wall_thickness=self.wall_thickness,
            length=self.tube_length,
            thread_size=self.thread_size,
            bolt_circle_diameter=self.mount_bolt_circle_diameter,
            num_bolts=self.num_mount_bolts,
            pod_width=self.pod_width,
            pod_height=self.pod_height,
            pod_depth=self.pod_depth,
            pod_center_z=self.pod_center_z,
            pod_bolt_circle_diameter=self.pod_bolt_circle_diameter,
            num_pod_bolts=self.num_pod_bolts,
        )

    @property
    def pod_center(self) -> tuple[float, float, float]:
        return self._shell_body().pod_center

    def assemble(self) -> cadquery.Assembly:
        body = self._shell_body()

        mount_clearance_diameter = (
            SHOULDER_BOLT_SPECS[self.thread_size].thread_diameter + _MOUNT_CLEARANCE
        )
        lid = ShellLid(
            outer_diameter=self.mount_diameter,
            thickness=self.lid_thickness,
            bolt_circle_diameter=self.mount_bolt_circle_diameter,
            num_bolts=self.num_mount_bolts,
            bolt_hole_diameter=mount_clearance_diameter,
            output_clearance_diameter=self.output_clearance_diameter,
            sensor_mount_radius=self.sensor_mount_radius,
            sensor_mount_angle=self.sensor_mount_angle,
            sensor_board_width=self.sensor_board_width,
            sensor_board_length=self.sensor_board_length,
            sensor_hole_inset=self.sensor_hole_inset,
            sensor_thread_size=self.sensor_thread_size,
        )

        # purchased-part stand-in for the encoder sensor breakout board,
        # same role Bearing plays for the eccentric bearing -- not a
        # manufacturable part, just enough shape for clearance checks
        sensor_board = Box(
            height=_SENSOR_BOARD_THICKNESS,
            width=self.sensor_board_length,
            depth=self.sensor_board_width,
        )
        sensor_board.material = MATERIALS["OFF_THE_SHELF"]

        assembly = cadquery.Assembly()
        attach(assembly, body, loc=Location(Vector(0, 0, 0)), name="shell_body")
        attach(
            assembly, lid, loc=Location(Vector(0, 0, self.tube_length)), name="shell_lid"
        )

        # sits in the lid's own sensor pocket, back flush against the
        # pocket floor (world z = tube_length + _SENSOR_POCKET_DEPTH),
        # component side facing back out through the pocket opening
        # toward OutputFlange's encoder magnet ring. The pocket is cut
        # INTO the lid (world z: tube_length -> tube_length +
        # _SENSOR_POCKET_DEPTH) -- placing the board's span on the other
        # side of tube_length, as before, put it inside the flange's own
        # magnet pocket instead, a dead-on collision with the magnet.
        sensor_board_z = (
            self.tube_length + _SENSOR_POCKET_DEPTH - _SENSOR_BOARD_THICKNESS / 2
        )
        angle = math.radians(self.sensor_mount_angle)
        board_x = self.sensor_mount_radius * math.cos(angle)
        board_y = self.sensor_mount_radius * math.sin(angle)
        attach(
            assembly,
            sensor_board,
            loc=Location(
                Vector(board_x, board_y, sensor_board_z),
                Vector(0, 0, 1),
                self.sensor_mount_angle,
            ),
            name="encoder_sensor_board",
        )
        return assembly
