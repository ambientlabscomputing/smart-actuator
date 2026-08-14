import cadquery
from cadquery import Location, Vector
from machinewright import CADAssembly, attach, register_assembly
from machinewright.lib.fasteners import SHOULDER_BOLT_SPECS, ScrewSize

from cad.objects.shell.shell_body import ShellBody
from cad.objects.shell.shell_lid import ShellLid

_MOUNT_CLEARANCE = 0.4


@register_assembly
class ShellAssembly(CADAssembly):
    """
    Cylindrical shell wrapping a gearbox stack. Decoupled from any
    specific gearbox -- takes the mating dimensions as plain params
    (mount diameter, bolt circle, tube length) rather than a
    `NemaSize`, the same way `RingHousing` doesn't know about
    `CycloidalDisc`. `ActuatorAssembly` is what bridges the two,
    reading these numbers off a `CycloidalGearboxAssembly` instance.
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
        )

        assembly = cadquery.Assembly()
        attach(assembly, body, loc=Location(Vector(0, 0, 0)), name="shell_body")
        attach(
            assembly, lid, loc=Location(Vector(0, 0, self.tube_length)), name="shell_lid"
        )
        return assembly
