import math

import cadquery
from machinewright import CADObject, register_object
from machinewright.lib.fasteners import HEAT_SET_INSERT_SPECS, SHOULDER_BOLT_SPECS

from cad.lib.materials import PRINTED
from cad.objects.cycloidal_gearbox.output_flange import OutputFlange

_PLUG_MARGIN = 1.0


@register_object
class IntegralPinOutputFlange(CADObject):
    """
    Wraps a real `OutputFlange` and molds its roller pins directly onto
    the disc-facing (<Z) face as solid pegs, instead of leaving holes for
    separate shoulder-bolt hardware -- see `IntegralPinRingHousing` for
    the rationale, mirrored here for the output side.

    Built entirely from `OutputFlange`'s own public geometry (its
    `.cad()` output plus its own instance params) -- `OutputFlange`
    itself is untouched. Its bolt-hole cutouts at each roller pin
    position are first plugged solid (spanning the full flange
    thickness, since that's where `OutputFlange` cut them), then a peg
    is added below.
    """

    material = PRINTED

    def __init__(self, output_flange: OutputFlange, pin_length: float):
        self.output_flange = output_flange
        self.pin_length = pin_length

    def cad(self) -> cadquery.Workplane:
        f = self.output_flange
        flange = f.cad()

        roller_radius = f.roller_circle_diameter / 2
        roller_points = [
            (
                roller_radius * math.cos(2 * math.pi * i / f.num_rollers),
                roller_radius * math.sin(2 * math.pi * i / f.num_rollers),
            )
            for i in range(f.num_rollers)
        ]

        bolt_spec = SHOULDER_BOLT_SPECS[f.thread_size]
        insert_spec = HEAT_SET_INSERT_SPECS[f.thread_size]
        plug_diameter = (
            max(bolt_spec.head_diameter, insert_spec.bore_diameter) + _PLUG_MARGIN
        )

        # fill the bolt-hole cutouts back in, spanning the full flange
        # thickness where they were cut
        plugs = (
            cadquery.Workplane("XY")
            .pushPoints(roller_points)
            .circle(plug_diameter / 2)
            .extrude(f.flange_thickness)
        )
        flange = flange.union(plugs)

        # then the pegs themselves, protruding below the disc-facing
        # (<Z) face
        pegs = (
            cadquery.Workplane("XY")
            .pushPoints(roller_points)
            .circle(f.roller_pin_diameter / 2)
            .extrude(-self.pin_length)
        )
        flange = flange.union(pegs)

        return flange
