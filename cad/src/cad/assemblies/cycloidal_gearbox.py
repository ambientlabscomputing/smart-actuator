import math
from types import SimpleNamespace

import cadquery
from cadquery import Location, Vector
from machinewright import CADAssembly, attach, register_assembly
from machinewright.lib.fasteners import (
    HEAT_SET_INSERT_SPECS,
    SHOULDER_BOLT_SPECS,
    ScrewSize,
)
from machinewright.objects.bearings.bearing import Bearing
from machinewright.objects.fasteners.shoulder_bolt import ShoulderBolt

from cad.lib.materials import METAL
from cad.lib.nema import NEMA_SPECS, NemaSize
from cad.objects.cycloidal_gearbox.cycloidal_disc import CycloidalDisc
from cad.objects.cycloidal_gearbox.input_shaft import InputShaft
from cad.objects.cycloidal_gearbox.motor_adapter_plate import MotorAdapterPlate
from cad.objects.cycloidal_gearbox.output_flange import OutputFlange
from cad.objects.cycloidal_gearbox.ring_housing import RingHousing

_INSERT_MARGIN = 3.0
_SHOULDER_REACH_MARGIN = 2.0
_SHELL_BOLT_CLEARANCE_DIAMETER = 3.4  # M3 clearance, provisional until the shell exists
_PILOT_TO_INTERFACE_BOLT_GAP = 4.0
_ROLLER_HEAD_DIAMETER_CLEARANCE = 0.4  # matches OutputFlange's own head clearance
_ADAPTER_PLATE_THICKNESS = 5.0
_ADAPTER_PILOT_MARGIN = 6.0
_ADAPTER_PILOT_DEPTH = 2.0


@register_assembly
class CycloidalGearboxAssembly(CADAssembly):
    """
    A single-stage cycloidal reduction gearbox that bolts onto a NEMA
    stepper motor face. Reduction ratio is `num_ring_pins - 1`.

    System-level params only -- this is the design contract. Everything
    else (bearing sizes, bore diameters, hole clearances) is derived from
    these plus the NEMA frame size.

    The output side has no printed shaft and no separate hub part
    designed by us -- `output_interface_diameter` sizes a pilot recess
    and bolt circle (with our own heat-set inserts) on `OutputFlange`
    itself, exposed as the actual external interface. Whatever the user
    needs to attach bolts straight into that with their own hardware.

    The motor side is NEMA-agnostic for the same reason: a separate
    `MotorAdapterPlate` (not `RingHousing` itself) carries the NEMA bolt
    pattern, bolted onto `RingHousing`'s own dedicated bolt circle. That
    keeps the ring pins' fasteners off a face whose layout we don't
    control, and means the rest of the gearbox -- ring pins, disc,
    output flange, shell -- is a complete, self-contained unit that
    never needs a motor present to be fully assembled.
    """

    def __init__(
        self,
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
        bearing_inner_diameter: float | None = None,
        bearing_outer_diameter: float | None = None,
    ):
        self.nema_size = nema_size
        self.num_ring_pins = num_ring_pins
        self.ring_pin_diameter = ring_pin_diameter
        self.eccentricity = eccentricity
        self.disc_thickness = disc_thickness
        self.num_output_rollers = num_output_rollers
        self.roller_pin_diameter = roller_pin_diameter
        self.num_adapter_bolts = num_adapter_bolts
        self.adapter_thread_size = adapter_thread_size
        self.output_interface_diameter = output_interface_diameter
        self.ring_pin_thread_size = ring_pin_thread_size
        self.roller_pin_thread_size = roller_pin_thread_size
        self.num_shell_bolts = num_shell_bolts
        self.num_interface_bolts = num_interface_bolts
        self.interface_thread_size = interface_thread_size
        self.bearing_inner_diameter = bearing_inner_diameter
        self.bearing_outer_diameter = bearing_outer_diameter

    def _derive(self) -> SimpleNamespace:
        """
        All geometry derived from the system-level params, in one place so
        `assemble()` and the read-only properties below never disagree.
        """
        spec = NEMA_SPECS[self.nema_size]

        ring_insert = HEAT_SET_INSERT_SPECS[self.ring_pin_thread_size]
        ring_bolt_spec = SHOULDER_BOLT_SPECS[self.ring_pin_thread_size]
        roller_insert = HEAT_SET_INSERT_SPECS[self.roller_pin_thread_size]
        roller_bolt_spec = SHOULDER_BOLT_SPECS[self.roller_pin_thread_size]

        housing_thickness = max(6.0, ring_insert.length + _INSERT_MARGIN)
        flange_thickness = max(6.0, roller_insert.length + _INSERT_MARGIN)

        ring_pin_circle_diameter = spec.faceplate_width * 1.4
        baseline_output_hole_circle_diameter = ring_pin_circle_diameter * 0.5

        # the eccentric boss doubles as the bearing's inner diameter, so
        # sizing the bearing to a specific real part (rather than the
        # NEMA-derived default) means overriding both together
        eccentric_boss_diameter = self.bearing_inner_diameter or spec.shaft_diameter * 2.4
        bearing_outer_diameter = self.bearing_outer_diameter or eccentric_boss_diameter + 8.0
        bearing_clearance = 0.2
        disc_center_bore_diameter = bearing_outer_diameter + bearing_clearance
        housing_input_bore_diameter = bearing_outer_diameter + 4.0

        output_hole_clearance = 0.2
        output_hole_diameter = (
            self.roller_pin_diameter + 2 * self.eccentricity + output_hole_clearance
        )

        set_screw_hole_diameter = 3.0
        shaft_length = housing_thickness + self.disc_thickness + 4.0

        # motor adapter plate's registration feature with RingHousing --
        # an internal joint between two of our own parts, sized off the
        # input bore rather than anything NEMA-specific
        adapter_pilot_diameter = housing_input_bore_diameter + 2 * _ADAPTER_PILOT_MARGIN
        adapter_pilot_depth = _ADAPTER_PILOT_DEPTH

        # output interface geometry: a pilot recess plus a bolt circle
        # with our own heat-set inserts, exposed on OutputFlange itself,
        # sized purely from the pilot -- it sits INSIDE the roller pin
        # circle (the concentric shaft/coupling interface, with the
        # rollers forming the outer structural ring around it), so it
        # doesn't need to know about the rollers at all.
        pilot_diameter = self.output_interface_diameter
        pilot_depth = 2.0
        interface_insert_radius = (
            HEAT_SET_INSERT_SPECS[self.interface_thread_size].bore_diameter / 2
        )
        interface_bolt_circle_diameter = pilot_diameter + 2 * (
            _PILOT_TO_INTERFACE_BOLT_GAP + interface_insert_radius
        )
        interface_outer_radius = interface_bolt_circle_diameter / 2 + interface_insert_radius

        # the roller circle -- and everything downstream of it, the disc's
        # output holes included, since they share this same value -- has
        # to sit far enough out that its own bolt counterbores clear the
        # interface, growing past the NEMA-derived baseline if a larger
        # interface needs the room
        roller_counterbore_radius = (
            roller_bolt_spec.head_diameter / 2 + _ROLLER_HEAD_DIAMETER_CLEARANCE / 2
        )
        min_output_hole_circle_radius = (
            interface_outer_radius + _PILOT_TO_INTERFACE_BOLT_GAP + roller_counterbore_radius
        )
        output_hole_circle_diameter = max(
            baseline_output_hole_circle_diameter, 2 * min_output_hole_circle_radius
        )

        # ring pin bolts: head + short thread engage the insert right
        # behind the head (near the motor-facing back face), long bare
        # shoulder projects up through the housing into the disc's plane
        ring_pin_thread_length = ring_insert.length - ring_bolt_spec.head_height
        ring_pin_shoulder_length = (
            (housing_thickness - ring_insert.length)
            + self.disc_thickness
            + _SHOULDER_REACH_MARGIN
        )

        # roller pin bolts: same idea, but installed from the flange's
        # outward face with the shoulder projecting down through the
        # flange into the disc's plane
        roller_pin_thread_length = roller_insert.length - roller_bolt_spec.head_height
        roller_pin_shoulder_length = (
            (flange_thickness - roller_insert.length)
            + self.disc_thickness
            + _SHOULDER_REACH_MARGIN
        )

        return SimpleNamespace(
            housing_thickness=housing_thickness,
            flange_thickness=flange_thickness,
            ring_pin_circle_diameter=ring_pin_circle_diameter,
            output_hole_circle_diameter=output_hole_circle_diameter,
            eccentric_boss_diameter=eccentric_boss_diameter,
            bearing_outer_diameter=bearing_outer_diameter,
            disc_center_bore_diameter=disc_center_bore_diameter,
            housing_input_bore_diameter=housing_input_bore_diameter,
            output_hole_diameter=output_hole_diameter,
            set_screw_hole_diameter=set_screw_hole_diameter,
            shaft_length=shaft_length,
            adapter_pilot_diameter=adapter_pilot_diameter,
            adapter_pilot_depth=adapter_pilot_depth,
            pilot_diameter=pilot_diameter,
            pilot_depth=pilot_depth,
            interface_bolt_circle_diameter=interface_bolt_circle_diameter,
            ring_pin_thread_length=ring_pin_thread_length,
            ring_pin_shoulder_length=ring_pin_shoulder_length,
            roller_pin_thread_length=roller_pin_thread_length,
            roller_pin_shoulder_length=roller_pin_shoulder_length,
        )

    def _ring_housing(self, d: SimpleNamespace | None = None) -> RingHousing:
        d = d or self._derive()
        return RingHousing(
            num_ring_pins=self.num_ring_pins,
            ring_pin_diameter=self.ring_pin_diameter,
            ring_pin_circle_diameter=d.ring_pin_circle_diameter,
            housing_thickness=d.housing_thickness,
            input_bore_diameter=d.housing_input_bore_diameter,
            thread_size=self.ring_pin_thread_size,
            num_shell_bolts=self.num_shell_bolts,
            shell_bolt_diameter=_SHELL_BOLT_CLEARANCE_DIAMETER,
            num_adapter_bolts=self.num_adapter_bolts,
            adapter_thread_size=self.adapter_thread_size,
            adapter_pilot_diameter=d.adapter_pilot_diameter,
            adapter_pilot_depth=d.adapter_pilot_depth,
        )

    def _motor_adapter_plate(
        self, d: SimpleNamespace | None = None, ring_housing: RingHousing | None = None
    ) -> MotorAdapterPlate:
        d = d or self._derive()
        ring_housing = ring_housing or self._ring_housing(d)
        return MotorAdapterPlate(
            nema_size=self.nema_size,
            thickness=_ADAPTER_PLATE_THICKNESS,
            input_bore_diameter=d.housing_input_bore_diameter,
            num_housing_bolts=self.num_adapter_bolts,
            housing_bolt_circle_diameter=ring_housing.adapter_bolt_circle_diameter,
            housing_thread_size=self.adapter_thread_size,
            housing_pilot_diameter=d.adapter_pilot_diameter,
            housing_pilot_depth=d.adapter_pilot_depth,
        )

    @property
    def shell_mount_diameter(self) -> float:
        """Outer diameter of the ring housing -- what a shell has to wrap around."""
        return self._ring_housing().footprint_diameter

    @property
    def shell_bolt_circle_diameter(self) -> float:
        """Bolt circle a shell's base flange has to match to mate with the housing."""
        return self._ring_housing().shell_bolt_circle_diameter

    @property
    def housing_thickness(self) -> float:
        """Axial offset from the assembly's own z=0 to the ring housing's
        disc-facing (>Z) face -- where a shell's base flange should sit."""
        return self._derive().housing_thickness

    @property
    def tube_length(self) -> float:
        """
        Axial length a shell tube needs to span, starting from the ring
        housing's disc-facing face (`housing_thickness`) out to the
        output flange's outward face -- where the external interface
        (and whatever the user bolts to it) is exposed.
        """
        d = self._derive()
        return self.disc_thickness + d.flange_thickness

    @property
    def interface_bolt_circle_diameter(self) -> float:
        """Bolt circle of the exposed output interface on OutputFlange."""
        return self._derive().interface_bolt_circle_diameter

    def assemble(self) -> cadquery.Assembly:
        d = self._derive()

        ring_housing = self._ring_housing(d)
        motor_adapter_plate = self._motor_adapter_plate(d, ring_housing)

        input_shaft = InputShaft(
            nema_size=self.nema_size,
            eccentricity=self.eccentricity,
            eccentric_boss_diameter=d.eccentric_boss_diameter,
            shaft_length=d.shaft_length,
            set_screw_hole_diameter=d.set_screw_hole_diameter,
        )

        disc = CycloidalDisc(
            num_ring_pins=self.num_ring_pins,
            ring_pin_diameter=self.ring_pin_diameter,
            ring_pin_circle_diameter=d.ring_pin_circle_diameter,
            eccentricity=self.eccentricity,
            thickness=self.disc_thickness,
            center_bore_diameter=d.disc_center_bore_diameter,
            num_output_holes=self.num_output_rollers,
            output_hole_diameter=d.output_hole_diameter,
            output_hole_circle_diameter=d.output_hole_circle_diameter,
        )

        eccentric_bearing = Bearing(
            outer_diameter=d.bearing_outer_diameter,
            inner_diameter=d.eccentric_boss_diameter,
            width=self.disc_thickness,
        )

        output_flange = OutputFlange(
            num_rollers=self.num_output_rollers,
            roller_pin_diameter=self.roller_pin_diameter,
            roller_circle_diameter=d.output_hole_circle_diameter,
            flange_thickness=d.flange_thickness,
            thread_size=self.roller_pin_thread_size,
            pilot_diameter=d.pilot_diameter,
            pilot_depth=d.pilot_depth,
            num_interface_bolts=self.num_interface_bolts,
            interface_bolt_circle_diameter=d.interface_bolt_circle_diameter,
            interface_thread_size=self.interface_thread_size,
        )

        ring_pin = ShoulderBolt(
            thread_size=self.ring_pin_thread_size,
            shoulder_diameter=self.ring_pin_diameter,
            shoulder_length=d.ring_pin_shoulder_length,
            thread_length=d.ring_pin_thread_length,
        )

        roller_pin = ShoulderBolt(
            thread_size=self.roller_pin_thread_size,
            shoulder_diameter=self.roller_pin_diameter,
            shoulder_length=d.roller_pin_shoulder_length,
            thread_length=d.roller_pin_thread_length,
        )

        # dark grey/black for this project's metal hardware, distinct from
        # machinewright's own generic OFF_THE_SHELF grey
        eccentric_bearing.material = METAL
        ring_pin.material = METAL
        roller_pin.material = METAL

        assembly = cadquery.Assembly()

        # ring housing sits at z=0..housing_thickness
        attach(
            assembly, ring_housing, loc=Location(Vector(0, 0, 0)), name="ring_housing"
        )

        # motor adapter plate sits behind it, at z=-thickness..0 -- its
        # pilot boss (at the top of its own local frame) registers flush
        # into the ring housing's recess at world z=0
        attach(
            assembly,
            motor_adapter_plate,
            loc=Location(Vector(0, 0, -_ADAPTER_PLATE_THICKNESS)),
            name="motor_adapter_plate",
        )

        attach(
            assembly, input_shaft, loc=Location(Vector(0, 0, 0)), name="input_shaft"
        )

        disc_z = d.housing_thickness
        attach(
            assembly,
            eccentric_bearing,
            loc=Location(Vector(self.eccentricity, 0, disc_z)),
            name="eccentric_bearing",
        )

        # the disc is built centered on its own rotation axis (the
        # eccentric boss), so it gets placed offset by `eccentricity` from
        # the housing's central axis
        attach(
            assembly,
            disc,
            loc=Location(Vector(self.eccentricity, 0, disc_z)),
            name="cycloidal_disc",
        )

        output_flange_z = disc_z + self.disc_thickness
        attach(
            assembly,
            output_flange,
            loc=Location(Vector(0, 0, output_flange_z)),
            name="output_flange",
        )

        # ring pin bolts: head at world z=0 (housing's back face), no
        # rotation needed -- the bolt is already built head-first along +Z
        ring_radius = d.ring_pin_circle_diameter / 2
        for i in range(self.num_ring_pins):
            angle = 2 * math.pi * i / self.num_ring_pins
            x = ring_radius * math.cos(angle)
            y = ring_radius * math.sin(angle)
            attach(
                assembly, ring_pin, loc=Location(Vector(x, y, 0)), name=f"ring_pin_{i}"
            )

        # roller pin bolts: head at the flange's outward face, flipped
        # 180 degrees so the shoulder projects downward into the disc
        roller_head_z = output_flange_z + d.flange_thickness
        roller_radius = d.output_hole_circle_diameter / 2
        for i in range(self.num_output_rollers):
            angle = 2 * math.pi * i / self.num_output_rollers
            x = roller_radius * math.cos(angle)
            y = roller_radius * math.sin(angle)
            attach(
                assembly,
                roller_pin,
                loc=Location(Vector(x, y, roller_head_z), Vector(1, 0, 0), 180),
                name=f"roller_pin_{i}",
            )

        return assembly
