import math

import cadquery
from machinewright import CADObject, register_object
from machinewright.lib.fasteners import (
    HEAT_SET_INSERT_SPECS,
    SHOULDER_BOLT_SPECS,
    ScrewSize,
)

_HEAD_DIAMETER_CLEARANCE = 0.4
_HEAD_DEPTH_CLEARANCE = 0.2
_SHOULDER_CLEARANCE = 0.2
_HUB_WALL_MARGIN = 4.0


@register_object
class OutputFlange(CADObject):
    """
    The output side of the drive: a flange plate with holes for the
    output roller pins (which ride in the cycloidal disc's output holes).

    No printed output shaft, and no separate metal hub part designed by
    us either -- both just relocate the same "one fixed shaft" problem.
    Instead the outward (>Z) face carries a pilot recess plus a bolt
    circle with its own heat-set inserts, exposed as the actual external
    interface: whatever shaft/coupling/hub the user needs bolts directly
    into this plate with their own hardware. Torque is carried by
    several bolts in shear, never by printed plastic, and the interface
    itself stays generic instead of us guessing at a shaft design.

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
        pilot_diameter: float,
        pilot_depth: float,
        num_interface_bolts: int,
        interface_bolt_circle_diameter: float,
        interface_thread_size: ScrewSize,
    ):
        self.num_rollers = num_rollers
        self.roller_pin_diameter = roller_pin_diameter
        self.roller_circle_diameter = roller_circle_diameter
        self.flange_thickness = flange_thickness
        self.thread_size = thread_size
        self.pilot_diameter = pilot_diameter
        self.pilot_depth = pilot_depth
        self.num_interface_bolts = num_interface_bolts
        self.interface_bolt_circle_diameter = interface_bolt_circle_diameter
        self.interface_thread_size = interface_thread_size

    def cad(self) -> cadquery.Workplane:
        interface_insert_spec = HEAT_SET_INSERT_SPECS[self.interface_thread_size]

        roller_span = (
            self.roller_circle_diameter
            + self.roller_pin_diameter
            + 2 * _HUB_WALL_MARGIN
        )
        interface_span = (
            self.interface_bolt_circle_diameter
            + interface_insert_spec.bore_diameter
            + 2 * _HUB_WALL_MARGIN
        )
        flange_diameter = max(roller_span, interface_span)

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

        # pilot recess for whatever the user attaches to register into
        flange = (
            flange.faces(">Z")
            .workplane()
            .circle(self.pilot_diameter / 2)
            .cutBlind(-self.pilot_depth)
        )

        # external interface bolt circle -- heat-set inserts live here,
        # in our part, so the user's own hardware just threads straight
        # in. This *is* the product's output interface.
        interface_radius = self.interface_bolt_circle_diameter / 2
        interface_points = [
            (
                interface_radius * math.cos(2 * math.pi * i / self.num_interface_bolts),
                interface_radius * math.sin(2 * math.pi * i / self.num_interface_bolts),
            )
            for i in range(self.num_interface_bolts)
        ]
        flange = (
            flange.faces(">Z")
            .workplane()
            .pushPoints(interface_points)
            .hole(interface_insert_spec.bore_diameter, depth=interface_insert_spec.length)
        )

        return flange
