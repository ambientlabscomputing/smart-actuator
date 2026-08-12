import cadquery
from cadquery import Location, Vector

from cad.assemblies.base import CADAssembly
from cad.assemblies.cycloidal_gearbox import CycloidalGearboxAssembly
from cad.assemblies.electronics import ElectronicsAssembly
from cad.assemblies.shell import ShellAssembly
from cad.lib.fasteners import HEAT_SET_INSERT_SPECS, SHOULDER_BOLT_SPECS, ScrewSize
from cad.lib.nema import NemaSize

_POD_BOLT_MARGIN = 8.0
_MOUNT_CLEARANCE = 0.4
_OUTPUT_INTERFACE_GAP = 8.0


class ActuatorAssembly(CADAssembly):
    """
    Top-level "smart gearbox" product assembly: nests the cycloidal
    gearbox, the outer shell, and the electronics board mount --
    each already verified independently. This is what bridges them:
    the shell's mating dimensions come from the gearbox's derived
    properties, and the electronics board mount's outer bolt circle is
    derived to match the shell's pod opening, so all three actually
    mate rather than just coexisting.
    """

    def __init__(
        self,
        # gearbox
        nema_size: NemaSize,
        num_ring_pins: int,
        ring_pin_diameter: float,
        eccentricity: float,
        disc_thickness: float,
        num_output_rollers: int,
        roller_pin_diameter: float,
        output_interface_diameter: float,
        ring_pin_thread_size: ScrewSize,
        roller_pin_thread_size: ScrewSize,
        num_shell_bolts: int,
        num_interface_bolts: int,
        interface_thread_size: ScrewSize,
        num_adapter_bolts: int,
        adapter_thread_size: ScrewSize,
        # shell
        shell_wall_thickness: float,
        shell_lid_thickness: float,
        shell_thread_size: ScrewSize,
        pod_depth: float,
        pod_center_z: float,
        # electronics
        board_width: float,
        board_length: float,
        board_hole_inset: float,
        board_standoff_height: float,
        board_plate_thickness: float,
        board_thread_size: ScrewSize,
        num_board_bolts: int,
    ):
        self.nema_size = nema_size
        self.num_ring_pins = num_ring_pins
        self.ring_pin_diameter = ring_pin_diameter
        self.eccentricity = eccentricity
        self.disc_thickness = disc_thickness
        self.num_output_rollers = num_output_rollers
        self.roller_pin_diameter = roller_pin_diameter
        self.output_interface_diameter = output_interface_diameter
        self.ring_pin_thread_size = ring_pin_thread_size
        self.roller_pin_thread_size = roller_pin_thread_size
        self.num_shell_bolts = num_shell_bolts
        self.num_interface_bolts = num_interface_bolts
        self.interface_thread_size = interface_thread_size
        self.num_adapter_bolts = num_adapter_bolts
        self.adapter_thread_size = adapter_thread_size
        self.shell_wall_thickness = shell_wall_thickness
        self.shell_lid_thickness = shell_lid_thickness
        self.shell_thread_size = shell_thread_size
        self.pod_depth = pod_depth
        self.pod_center_z = pod_center_z
        self.board_width = board_width
        self.board_length = board_length
        self.board_hole_inset = board_hole_inset
        self.board_standoff_height = board_standoff_height
        self.board_plate_thickness = board_plate_thickness
        self.board_thread_size = board_thread_size
        self.num_board_bolts = num_board_bolts

    def _gearbox(self) -> CycloidalGearboxAssembly:
        return CycloidalGearboxAssembly(
            nema_size=self.nema_size,
            num_ring_pins=self.num_ring_pins,
            ring_pin_diameter=self.ring_pin_diameter,
            eccentricity=self.eccentricity,
            disc_thickness=self.disc_thickness,
            num_output_rollers=self.num_output_rollers,
            roller_pin_diameter=self.roller_pin_diameter,
            output_interface_diameter=self.output_interface_diameter,
            ring_pin_thread_size=self.ring_pin_thread_size,
            roller_pin_thread_size=self.roller_pin_thread_size,
            num_shell_bolts=self.num_shell_bolts,
            num_interface_bolts=self.num_interface_bolts,
            interface_thread_size=self.interface_thread_size,
            num_adapter_bolts=self.num_adapter_bolts,
            adapter_thread_size=self.adapter_thread_size,
        )

    def assemble(self) -> cadquery.Assembly:
        gearbox = self._gearbox()

        # the board's outer bolt circle and the shell pod's opening have
        # to agree with each other -- derive both from the board's own
        # footprint here, once, rather than as two independent params
        # that could drift apart
        pod_width = self.board_width
        pod_height = self.board_length
        pod_bolt_circle_diameter = min(pod_width, pod_height) + _POD_BOLT_MARGIN
        mount_bolt_diameter = (
            SHOULDER_BOLT_SPECS[self.shell_thread_size].thread_diameter
            + _MOUNT_CLEARANCE
        )

        # big enough to see/reach the whole exposed interface bolt circle
        # on the output flange through the lid -- accounts for the bolt
        # holes' own extent (not just the nominal circle diameter) plus a
        # real gap, there's no shaft to size this around anymore
        interface_insert_radius = (
            HEAT_SET_INSERT_SPECS[self.interface_thread_size].bore_diameter / 2
        )
        output_clearance_diameter = (
            gearbox.interface_bolt_circle_diameter
            + 2 * (interface_insert_radius + _OUTPUT_INTERFACE_GAP)
        )

        shell = ShellAssembly(
            mount_diameter=gearbox.shell_mount_diameter,
            mount_bolt_circle_diameter=gearbox.shell_bolt_circle_diameter,
            num_mount_bolts=self.num_shell_bolts,
            tube_length=gearbox.tube_length,
            wall_thickness=self.shell_wall_thickness,
            lid_thickness=self.shell_lid_thickness,
            thread_size=self.shell_thread_size,
            output_clearance_diameter=output_clearance_diameter,
            pod_width=pod_width,
            pod_height=pod_height,
            pod_depth=self.pod_depth,
            pod_center_z=self.pod_center_z,
            pod_bolt_circle_diameter=pod_bolt_circle_diameter,
            num_pod_bolts=self.num_board_bolts,
        )

        electronics = ElectronicsAssembly(
            board_width=self.board_width,
            board_length=self.board_length,
            hole_inset=self.board_hole_inset,
            standoff_height=self.board_standoff_height,
            plate_thickness=self.board_plate_thickness,
            thread_size=self.board_thread_size,
            num_mount_bolts=self.num_board_bolts,
            mount_bolt_circle_diameter=pod_bolt_circle_diameter,
            mount_bolt_diameter=mount_bolt_diameter,
        )

        assembly = cadquery.Assembly()

        assembly.add(gearbox.assemble(), loc=Location(Vector(0, 0, 0)), name="gearbox")

        # the shell's own z=0 (its base flange) sits at the ring housing's
        # disc-facing face, not the gearbox's own z=0
        shell_z = gearbox.housing_thickness
        assembly.add(
            shell.assemble(), loc=Location(Vector(0, 0, shell_z)), name="shell"
        )

        # the board mount bolts onto the pod from outside: its own local
        # +Z (where the standoffs/board sit) has to point inward along
        # -X so the plate's flat back face sits flush with the pod's
        # outward-facing frame, board recessed inside the pod cavity
        pod_x, pod_y, pod_z = shell.pod_center
        board_loc = Location(
            Vector(pod_x, pod_y, shell_z + pod_z), Vector(0, 1, 0), -90
        )
        assembly.add(electronics.assemble(), loc=board_loc, name="electronics")

        return assembly
