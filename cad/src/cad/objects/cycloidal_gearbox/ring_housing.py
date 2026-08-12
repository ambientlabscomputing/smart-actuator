import math

import cadquery

from cad.lib.fasteners import HEAT_SET_INSERT_SPECS, SHOULDER_BOLT_SPECS, ScrewSize
from cad.lib.nema import NEMA_SPECS, NemaSize
from cad.objects.base import CADObject

_HEAD_DIAMETER_CLEARANCE = 0.4
_HEAD_DEPTH_CLEARANCE = 0.2
_SHOULDER_CLEARANCE = 0.2
_SHELL_BOLT_EDGE_MARGIN = 6.0


class RingHousing(CADObject):
    """
    The fixed "stator" of the drive: bolts to the NEMA motor face, holds
    the ring pins the cycloidal disc rolls against, and passes the input
    shaft/eccentric assembly through its center bore.

    Round rather than square: a square blank wastes material/print time
    at the corners and doesn't give an outer shell anything sensible to
    register against. A bolt circle near the outer edge is reserved for
    mounting an (as yet undesigned) outer shell.

    Each ring pin is a shoulder bolt threaded in from the motor-facing
    (<Z) face into a heat-set insert: head counterbore + insert bore cut
    from <Z, with a clearance through-hole for the bolt's smooth shoulder
    (the disc's actual contact surface) spanning the rest of the housing
    thickness up to the disc-facing (>Z) face.
    """

    def __init__(
        self,
        nema_size: NemaSize,
        num_ring_pins: int,
        ring_pin_diameter: float,
        ring_pin_circle_diameter: float,
        housing_thickness: float,
        input_bore_diameter: float,
        thread_size: ScrewSize,
        num_shell_bolts: int,
        shell_bolt_diameter: float,
    ):
        self.nema_size = nema_size
        self.num_ring_pins = num_ring_pins
        self.ring_pin_diameter = ring_pin_diameter
        self.ring_pin_circle_diameter = ring_pin_circle_diameter
        self.housing_thickness = housing_thickness
        self.input_bore_diameter = input_bore_diameter
        self.thread_size = thread_size
        self.num_shell_bolts = num_shell_bolts
        self.shell_bolt_diameter = shell_bolt_diameter

    def cad(self) -> cadquery.Workplane:
        spec = NEMA_SPECS[self.nema_size]

        # The housing footprint has to be large enough to carry the NEMA
        # bolt pattern (corner-to-corner of that square pattern, not just
        # its side length) and to keep a wall of material around the ring
        # pins for reductions with a larger ring pin circle than the
        # motor face.
        wall_margin = 4.0
        nema_span = (
            spec.bolt_spacing * math.sqrt(2) + spec.bolt_hole_diameter + 2 * wall_margin
        )
        ring_pin_span = (
            self.ring_pin_circle_diameter + self.ring_pin_diameter + 2 * wall_margin
        )
        footprint_diameter = max(nema_span, ring_pin_span)

        housing = (
            cadquery.Workplane("XY")
            .circle(footprint_diameter / 2)
            .extrude(self.housing_thickness)
        )

        half_spacing = spec.bolt_spacing / 2
        bolt_points = [
            (x, y)
            for x in (-half_spacing, half_spacing)
            for y in (-half_spacing, half_spacing)
        ]
        housing = (
            housing.faces(">Z")
            .workplane()
            .pushPoints(bolt_points)
            .hole(spec.bolt_hole_diameter)
        )

        ring_radius = self.ring_pin_circle_diameter / 2
        ring_points = [
            (
                ring_radius * math.cos(2 * math.pi * i / self.num_ring_pins),
                ring_radius * math.sin(2 * math.pi * i / self.num_ring_pins),
            )
            for i in range(self.num_ring_pins)
        ]

        # shoulder clearance through-hole, spanning the full thickness so
        # the bolt's shoulder can reach the disc on the >Z face
        housing = (
            housing.faces(">Z")
            .workplane()
            .pushPoints(ring_points)
            .hole(self.ring_pin_diameter + _SHOULDER_CLEARANCE)
        )

        # head counterbore + insert bore, cut from the motor-facing <Z
        # face where the bolts are installed from
        bolt_spec = SHOULDER_BOLT_SPECS[self.thread_size]
        insert_spec = HEAT_SET_INSERT_SPECS[self.thread_size]
        housing = (
            housing.faces("<Z")
            .workplane()
            .pushPoints(ring_points)
            .cboreHole(
                diameter=insert_spec.bore_diameter,
                cboreDiameter=bolt_spec.head_diameter + _HEAD_DIAMETER_CLEARANCE,
                cboreDepth=bolt_spec.head_height + _HEAD_DEPTH_CLEARANCE,
                depth=insert_spec.length,
            )
        )

        housing = housing.faces(">Z").workplane().hole(self.input_bore_diameter)

        housing = (
            housing.faces("<Z")
            .workplane()
            .circle(spec.pilot_boss_diameter / 2)
            .cutBlind(-spec.pilot_boss_depth)
        )

        # shell mounting bolt circle, near the outer edge
        shell_radius = footprint_diameter / 2 - _SHELL_BOLT_EDGE_MARGIN
        shell_points = [
            (
                shell_radius * math.cos(2 * math.pi * i / self.num_shell_bolts),
                shell_radius * math.sin(2 * math.pi * i / self.num_shell_bolts),
            )
            for i in range(self.num_shell_bolts)
        ]
        housing = (
            housing.faces(">Z")
            .workplane()
            .pushPoints(shell_points)
            .hole(self.shell_bolt_diameter)
        )

        return housing
