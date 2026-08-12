import math

import cadquery

from cad.lib.fasteners import HEAT_SET_INSERT_SPECS, SHOULDER_BOLT_SPECS, ScrewSize
from cad.objects.base import CADObject

_HEAD_DIAMETER_CLEARANCE = 0.4
_HEAD_DEPTH_CLEARANCE = 0.2
_SHOULDER_CLEARANCE = 0.2
_HUB_WALL_MARGIN = 4.0


class OutputFlange(CADObject):
    """
    The output side of the drive: a flange plate with holes for the
    output roller pins (which ride in the cycloidal disc's output holes).

    No printed output shaft -- a plastic boss here would be taking pure
    torque with layer lines perpendicular to the load and would snap off.
    Instead the outward (>Z) face carries a pilot recess and a bolt
    circle for a separate metal `OutputHub` (see output_hub.py) to bolt
    onto, so torque is carried by several bolts in shear plus a metal
    shaft, never by printed plastic.

    Each roller pin is a shoulder bolt threaded in from the outward (>Z)
    face into a heat-set insert: head counterbore + insert bore cut from
    >Z, with a clearance through-hole for the bolt's smooth shoulder (the
    disc's actual contact surface) spanning the rest of the flange
    thickness down to the disc-facing (<Z) face.
    """

    def __init__(
        self,
        num_rollers: int,
        roller_pin_diameter: float,
        roller_circle_diameter: float,
        flange_thickness: float,
        thread_size: ScrewSize,
        hub_pilot_diameter: float,
        hub_pilot_depth: float,
        num_hub_bolts: int,
        hub_bolt_circle_diameter: float,
        hub_bolt_diameter: float,
    ):
        self.num_rollers = num_rollers
        self.roller_pin_diameter = roller_pin_diameter
        self.roller_circle_diameter = roller_circle_diameter
        self.flange_thickness = flange_thickness
        self.thread_size = thread_size
        self.hub_pilot_diameter = hub_pilot_diameter
        self.hub_pilot_depth = hub_pilot_depth
        self.num_hub_bolts = num_hub_bolts
        self.hub_bolt_circle_diameter = hub_bolt_circle_diameter
        self.hub_bolt_diameter = hub_bolt_diameter

    def cad(self) -> cadquery.Workplane:
        roller_span = (
            self.roller_circle_diameter
            + self.roller_pin_diameter
            + 2 * _HUB_WALL_MARGIN
        )
        hub_span = (
            self.hub_bolt_circle_diameter
            + self.hub_bolt_diameter
            + 2 * _HUB_WALL_MARGIN
        )
        flange_diameter = max(roller_span, hub_span)

        flange = (
            cadquery.Workplane("XY")
            .circle(flange_diameter / 2)
            .extrude(self.flange_thickness)
        )

        roller_radius = self.roller_circle_diameter / 2
        roller_points = [
            (
                roller_radius * math.cos(2 * math.pi * i / self.num_rollers),
                roller_radius * math.sin(2 * math.pi * i / self.num_rollers),
            )
            for i in range(self.num_rollers)
        ]

        # shoulder clearance through-hole, spanning the full thickness so
        # the bolt's shoulder can reach the disc on the <Z face
        flange = (
            flange.faces(">Z")
            .workplane()
            .pushPoints(roller_points)
            .hole(self.roller_pin_diameter + _SHOULDER_CLEARANCE)
        )

        # head counterbore + insert bore, cut from the outward >Z face
        # where the bolts are installed from
        bolt_spec = SHOULDER_BOLT_SPECS[self.thread_size]
        insert_spec = HEAT_SET_INSERT_SPECS[self.thread_size]
        flange = (
            flange.faces(">Z")
            .workplane()
            .pushPoints(roller_points)
            .cboreHole(
                diameter=insert_spec.bore_diameter,
                cboreDiameter=bolt_spec.head_diameter + _HEAD_DIAMETER_CLEARANCE,
                cboreDepth=bolt_spec.head_height + _HEAD_DEPTH_CLEARANCE,
                depth=insert_spec.length,
            )
        )

        # pilot recess for the metal output hub to register into
        flange = (
            flange.faces(">Z")
            .workplane()
            .circle(self.hub_pilot_diameter / 2)
            .cutBlind(-self.hub_pilot_depth)
        )

        # hub bolt circle -- clearance holes, the hub itself carries the
        # tapped holes
        hub_bolt_radius = self.hub_bolt_circle_diameter / 2
        hub_bolt_points = [
            (
                hub_bolt_radius * math.cos(2 * math.pi * i / self.num_hub_bolts),
                hub_bolt_radius * math.sin(2 * math.pi * i / self.num_hub_bolts),
            )
            for i in range(self.num_hub_bolts)
        ]
        flange = (
            flange.faces(">Z")
            .workplane()
            .pushPoints(hub_bolt_points)
            .hole(self.hub_bolt_diameter)
        )

        return flange
