import math

import cadquery
from cadquery import Location, Vector

from cad.assemblies.base import CADAssembly
from cad.lib.fasteners import HEAT_SET_INSERT_SPECS, SHOULDER_BOLT_SPECS, ScrewSize
from cad.lib.nema import NEMA_SPECS, NemaSize
from cad.objects.cycloidal_gearbox.bearing import Bearing
from cad.objects.cycloidal_gearbox.cycloidal_disc import CycloidalDisc
from cad.objects.cycloidal_gearbox.input_shaft import InputShaft
from cad.objects.cycloidal_gearbox.output_flange import OutputFlange
from cad.objects.cycloidal_gearbox.output_hub import OutputHub
from cad.objects.cycloidal_gearbox.ring_housing import RingHousing
from cad.objects.cycloidal_gearbox.shoulder_bolt import ShoulderBolt

_INSERT_MARGIN = 3.0
_SHOULDER_REACH_MARGIN = 2.0
_SHELL_BOLT_CLEARANCE_DIAMETER = 3.4  # M3 clearance, provisional until the shell exists


class CycloidalGearboxAssembly(CADAssembly):
    """
    A single-stage cycloidal reduction gearbox that bolts onto a NEMA
    stepper motor face. Reduction ratio is `num_ring_pins - 1`.

    System-level params only -- this is the design contract. Everything
    else (bearing sizes, bore diameters, hole clearances) is derived from
    these plus the NEMA frame size.
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
        output_shaft_diameter: float,
        ring_pin_thread_size: ScrewSize,
        roller_pin_thread_size: ScrewSize,
        num_shell_bolts: int,
        num_hub_bolts: int,
        hub_thread_size: ScrewSize,
    ):
        self.nema_size = nema_size
        self.num_ring_pins = num_ring_pins
        self.ring_pin_diameter = ring_pin_diameter
        self.eccentricity = eccentricity
        self.disc_thickness = disc_thickness
        self.num_output_rollers = num_output_rollers
        self.roller_pin_diameter = roller_pin_diameter
        self.output_shaft_diameter = output_shaft_diameter
        self.ring_pin_thread_size = ring_pin_thread_size
        self.roller_pin_thread_size = roller_pin_thread_size
        self.num_shell_bolts = num_shell_bolts
        self.num_hub_bolts = num_hub_bolts
        self.hub_thread_size = hub_thread_size

    def assemble(self) -> cadquery.Assembly:
        spec = NEMA_SPECS[self.nema_size]

        ring_insert = HEAT_SET_INSERT_SPECS[self.ring_pin_thread_size]
        ring_bolt_spec = SHOULDER_BOLT_SPECS[self.ring_pin_thread_size]
        roller_insert = HEAT_SET_INSERT_SPECS[self.roller_pin_thread_size]
        roller_bolt_spec = SHOULDER_BOLT_SPECS[self.roller_pin_thread_size]
        hub_bolt_spec = SHOULDER_BOLT_SPECS[self.hub_thread_size]

        housing_thickness = max(6.0, ring_insert.length + _INSERT_MARGIN)
        flange_thickness = max(6.0, roller_insert.length + _INSERT_MARGIN)

        ring_pin_circle_diameter = spec.faceplate_width * 1.4
        output_hole_circle_diameter = ring_pin_circle_diameter * 0.5

        eccentric_boss_diameter = spec.shaft_diameter * 2.4
        bearing_outer_diameter = eccentric_boss_diameter + 8.0
        bearing_clearance = 0.2
        disc_center_bore_diameter = bearing_outer_diameter + bearing_clearance
        housing_input_bore_diameter = bearing_outer_diameter + 4.0

        output_hole_clearance = 0.2
        output_hole_diameter = (
            self.roller_pin_diameter + 2 * self.eccentricity + output_hole_clearance
        )

        set_screw_hole_diameter = 3.0
        shaft_length = housing_thickness + self.disc_thickness + 4.0

        # metal output hub geometry: pilot registers into the flange's
        # recess, bolt circle clamps hub to flange, tapped holes live in
        # the metal (no insert needed there)
        hub_clearance_diameter = hub_bolt_spec.thread_diameter + 0.4
        hub_tapped_diameter = hub_bolt_spec.thread_diameter
        hub_pilot_diameter = self.output_shaft_diameter * 1.6
        hub_pilot_depth = 2.0
        hub_bolt_circle_diameter = hub_pilot_diameter + 10.0
        hub_flange_diameter = hub_bolt_circle_diameter + hub_clearance_diameter + 8.0
        hub_flange_thickness = 5.0
        hub_shaft_length = self.output_shaft_diameter * 2.5

        ring_housing = RingHousing(
            nema_size=self.nema_size,
            num_ring_pins=self.num_ring_pins,
            ring_pin_diameter=self.ring_pin_diameter,
            ring_pin_circle_diameter=ring_pin_circle_diameter,
            housing_thickness=housing_thickness,
            input_bore_diameter=housing_input_bore_diameter,
            thread_size=self.ring_pin_thread_size,
            num_shell_bolts=self.num_shell_bolts,
            shell_bolt_diameter=_SHELL_BOLT_CLEARANCE_DIAMETER,
        )

        input_shaft = InputShaft(
            nema_size=self.nema_size,
            eccentricity=self.eccentricity,
            eccentric_boss_diameter=eccentric_boss_diameter,
            shaft_length=shaft_length,
            set_screw_hole_diameter=set_screw_hole_diameter,
        )

        disc = CycloidalDisc(
            num_ring_pins=self.num_ring_pins,
            ring_pin_diameter=self.ring_pin_diameter,
            ring_pin_circle_diameter=ring_pin_circle_diameter,
            eccentricity=self.eccentricity,
            thickness=self.disc_thickness,
            center_bore_diameter=disc_center_bore_diameter,
            num_output_holes=self.num_output_rollers,
            output_hole_diameter=output_hole_diameter,
            output_hole_circle_diameter=output_hole_circle_diameter,
        )

        eccentric_bearing = Bearing(
            outer_diameter=bearing_outer_diameter,
            inner_diameter=eccentric_boss_diameter,
            width=self.disc_thickness,
        )

        output_flange = OutputFlange(
            num_rollers=self.num_output_rollers,
            roller_pin_diameter=self.roller_pin_diameter,
            roller_circle_diameter=output_hole_circle_diameter,
            flange_thickness=flange_thickness,
            thread_size=self.roller_pin_thread_size,
            hub_pilot_diameter=hub_pilot_diameter,
            hub_pilot_depth=hub_pilot_depth,
            num_hub_bolts=self.num_hub_bolts,
            hub_bolt_circle_diameter=hub_bolt_circle_diameter,
            hub_bolt_diameter=hub_clearance_diameter,
        )

        output_hub = OutputHub(
            shaft_diameter=self.output_shaft_diameter,
            shaft_length=hub_shaft_length,
            flange_diameter=hub_flange_diameter,
            flange_thickness=hub_flange_thickness,
            pilot_diameter=hub_pilot_diameter,
            pilot_height=hub_pilot_depth,
            num_bolts=self.num_hub_bolts,
            bolt_circle_diameter=hub_bolt_circle_diameter,
            bolt_hole_diameter=hub_tapped_diameter,
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
        ring_pin = ShoulderBolt(
            thread_size=self.ring_pin_thread_size,
            shoulder_diameter=self.ring_pin_diameter,
            shoulder_length=ring_pin_shoulder_length,
            thread_length=ring_pin_thread_length,
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
        roller_pin = ShoulderBolt(
            thread_size=self.roller_pin_thread_size,
            shoulder_diameter=self.roller_pin_diameter,
            shoulder_length=roller_pin_shoulder_length,
            thread_length=roller_pin_thread_length,
        )

        assembly = cadquery.Assembly()

        # ring housing sits at z=0..housing_thickness, bolted to the motor
        # face on its -Z side
        assembly.add(
            ring_housing.cad(), loc=Location(Vector(0, 0, 0)), name="ring_housing"
        )

        assembly.add(
            input_shaft.cad(), loc=Location(Vector(0, 0, 0)), name="input_shaft"
        )

        disc_z = housing_thickness
        assembly.add(
            eccentric_bearing.cad(),
            loc=Location(Vector(self.eccentricity, 0, disc_z)),
            name="eccentric_bearing",
        )

        # the disc is built centered on its own rotation axis (the
        # eccentric boss), so it gets placed offset by `eccentricity` from
        # the housing's central axis
        assembly.add(
            disc.cad(),
            loc=Location(Vector(self.eccentricity, 0, disc_z)),
            name="cycloidal_disc",
        )

        output_flange_z = disc_z + self.disc_thickness
        assembly.add(
            output_flange.cad(),
            loc=Location(Vector(0, 0, output_flange_z)),
            name="output_flange",
        )

        # output hub: its local z=0 (bottom of the flange, top of the
        # pilot boss) sits right at the printed flange's outward face, so
        # the pilot boss registers into the flange's recess and the
        # metal shaft continues on outward from there
        hub_z = output_flange_z + flange_thickness
        assembly.add(
            output_hub.cad(), loc=Location(Vector(0, 0, hub_z)), name="output_hub"
        )

        # ring pin bolts: head at world z=0 (housing's back face), no
        # rotation needed -- the bolt is already built head-first along +Z
        ring_radius = ring_pin_circle_diameter / 2
        for i in range(self.num_ring_pins):
            angle = 2 * math.pi * i / self.num_ring_pins
            x = ring_radius * math.cos(angle)
            y = ring_radius * math.sin(angle)
            assembly.add(
                ring_pin.cad(), loc=Location(Vector(x, y, 0)), name=f"ring_pin_{i}"
            )

        # roller pin bolts: head at the flange's outward face, flipped
        # 180 degrees so the shoulder projects downward into the disc
        roller_head_z = output_flange_z + flange_thickness
        roller_radius = output_hole_circle_diameter / 2
        for i in range(self.num_output_rollers):
            angle = 2 * math.pi * i / self.num_output_rollers
            x = roller_radius * math.cos(angle)
            y = roller_radius * math.sin(angle)
            assembly.add(
                roller_pin.cad(),
                loc=Location(Vector(x, y, roller_head_z), Vector(1, 0, 0), 180),
                name=f"roller_pin_{i}",
            )

        return assembly
