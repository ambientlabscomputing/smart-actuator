import cadquery
from cadquery import Location, Vector
from machinewright import attach, register_assembly
from machinewright.objects.bearings.bearing import Bearing

from cad.assemblies.cycloidal_gearbox import (
    _DISC_TO_FLANGE_CLEARANCE,
    CycloidalGearboxAssembly,
)
from cad.lib.materials import MAGNET, PRINTED
from cad.objects.alternate.integral_output_flange import IntegralPinOutputFlange
from cad.objects.alternate.integral_ring_housing import IntegralPinRingHousing
from cad.objects.cycloidal_gearbox.cycloidal_disc import CycloidalDisc
from cad.objects.cycloidal_gearbox.output_flange import OutputFlange

_ADAPTER_PLATE_THICKNESS = 5.0


@register_assembly
class AlternateCycloidalGearboxAssembly(CycloidalGearboxAssembly):
    """
    Fully 3D-printable test-fit build of `CycloidalGearboxAssembly`:
    same design contract (inherits its params, its derived geometry, and
    its `RingHousing`/`MotorAdapterPlate`/`OutputFlange` construction
    unchanged), but the eccentric bearing prints instead of using
    off-the-shelf hardware, and the ring/roller pins are molded directly
    onto the housing/flange (via `IntegralPinRingHousing` /
    `IntegralPinOutputFlange`) instead of being separate shoulder bolts
    -- nothing to squeeze into place when metal-hardware clearances
    don't apply to plastic-on-plastic fit.

    `CycloidalGearboxAssembly` itself is never modified -- this only
    reuses its public constructor, its `_derive()`/`_ring_housing()`/
    `_motor_adapter_plate()` helpers, and its read-only properties
    (all inherited, not overridden), and replaces `assemble()` entirely.
    """

    def assemble(self) -> cadquery.Assembly:
        d = self._derive()

        ring_housing = self._ring_housing(d)
        motor_adapter_plate = self._motor_adapter_plate(d, ring_housing)
        integral_ring_housing = IntegralPinRingHousing(
            ring_housing=ring_housing, pin_length=self.disc_thickness
        )

        input_shaft = self._input_shaft(d)

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
        eccentric_bearing.material = PRINTED

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
            sensor_ring_inner_diameter=d.sensor_ring_inner_diameter,
            sensor_ring_outer_diameter=d.sensor_ring_outer_diameter,
            sensor_magnet_pocket_depth=d.sensor_magnet_pocket_depth,
        )
        integral_output_flange = IntegralPinOutputFlange(
            output_flange=output_flange,
            pin_length=self.disc_thickness + _DISC_TO_FLANGE_CLEARANCE,
        )

        encoder_magnet = Bearing(
            outer_diameter=d.sensor_ring_outer_diameter,
            inner_diameter=d.sensor_ring_inner_diameter,
            width=d.sensor_magnet_pocket_depth,
        )
        encoder_magnet.material = MAGNET

        assembly = cadquery.Assembly()

        # ring housing (with integral pins) sits at z=0..housing_thickness
        attach(
            assembly,
            integral_ring_housing,
            loc=Location(Vector(0, 0, 0)),
            name="ring_housing",
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

        output_flange_z = disc_z + self.disc_thickness + _DISC_TO_FLANGE_CLEARANCE
        attach(
            assembly,
            integral_output_flange,
            loc=Location(Vector(0, 0, output_flange_z)),
            name="output_flange",
        )

        encoder_magnet_z = (
            output_flange_z + d.flange_thickness - d.sensor_magnet_pocket_depth
        )
        attach(
            assembly,
            encoder_magnet,
            loc=Location(Vector(0, 0, encoder_magnet_z)),
            name="encoder_magnet_ring",
        )

        return assembly
