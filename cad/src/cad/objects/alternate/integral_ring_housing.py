import math

import cadquery
from machinewright import CADObject, register_object
from machinewright.lib.fasteners import HEAT_SET_INSERT_SPECS, SHOULDER_BOLT_SPECS

from cad.lib.materials import PRINTED
from cad.objects.cycloidal_gearbox.ring_housing import RingHousing

_PLUG_MARGIN = 1.0


@register_object
class IntegralPinRingHousing(CADObject):
    """
    Wraps a real `RingHousing` and molds its ring pins directly onto the
    disc-facing (>Z) face as solid pegs, instead of leaving holes for
    separate shoulder-bolt hardware -- for a print-test-fit build where
    the pins don't need to be removable, just the disc's rolling contact
    surface, printed as one piece with the housing so there's nothing to
    squeeze into place.

    Built entirely from `RingHousing`'s own public geometry (its
    `.cad()` output plus its own instance params) -- `RingHousing`
    itself is untouched. Its bolt-hole cutouts at each ring pin position
    are first plugged solid (spanning the full housing thickness, since
    that's where `RingHousing` cut them), then a peg is added on top.
    """

    material = PRINTED

    def __init__(self, ring_housing: RingHousing, pin_length: float):
        self.ring_housing = ring_housing
        self.pin_length = pin_length

    def cad(self) -> cadquery.Workplane:
        h = self.ring_housing
        housing = h.cad()

        ring_radius = h.ring_pin_circle_diameter / 2
        ring_points = [
            (
                ring_radius * math.cos(2 * math.pi * i / h.num_ring_pins),
                ring_radius * math.sin(2 * math.pi * i / h.num_ring_pins),
            )
            for i in range(h.num_ring_pins)
        ]

        bolt_spec = SHOULDER_BOLT_SPECS[h.thread_size]
        insert_spec = HEAT_SET_INSERT_SPECS[h.thread_size]
        plug_diameter = (
            max(bolt_spec.head_diameter, insert_spec.bore_diameter) + _PLUG_MARGIN
        )

        # fill the bolt-hole cutouts back in, spanning the full housing
        # thickness where they were cut
        plugs = (
            cadquery.Workplane("XY")
            .pushPoints(ring_points)
            .circle(plug_diameter / 2)
            .extrude(h.housing_thickness)
        )
        housing = housing.union(plugs)

        # then the pegs themselves, on the disc-facing face
        pegs = (
            cadquery.Workplane("XY", origin=(0, 0, h.housing_thickness))
            .pushPoints(ring_points)
            .circle(h.ring_pin_diameter / 2)
            .extrude(self.pin_length)
        )
        housing = housing.union(pegs)

        return housing
