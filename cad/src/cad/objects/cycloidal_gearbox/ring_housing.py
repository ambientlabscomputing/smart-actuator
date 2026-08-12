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
_RING_PIN_TO_OUTER_BOLT_GAP = 6.0  # material gap between ring pins and either outer ring
_OUTER_BOLT_WALL_MARGIN = 4.0


@register_object
class RingHousing(CADObject):
    """
    The fixed "stator" of the drive: holds the ring pins the cycloidal
    disc rolls against, and passes the input shaft/eccentric assembly
    through its center bore.

    NEMA-agnostic on purpose: motor attachment lives entirely on a
    separate `MotorAdapterPlate` that bolts to this part's <Z face,
    so this housing -- ring pins, disc, output flange, shell and all --
    is a complete, self-contained unit the factory can build without
    ever touching a motor. Putting the motor's own fixed bolt pattern
    directly on this face (as an earlier version did) forced the ring
    pins' fasteners to share a face whose layout we didn't control.

    Two independent bolt circles ring the outside of the ring pins, each
    positioned a real material gap beyond the ring pins' own outer edge
    (not derived from the footprint, which is itself sized off the ring
    pin span -- doing that let rings land on top of each other):
    - on the >Z (disc-facing) face, a plain clearance bolt circle for an
      outer shell to bolt onto.
    - on the <Z face, a bolt circle with our own heat-set inserts (this
      is an internal joint between two of our own parts, so we own the
      thread) plus a pilot recess, both for the `MotorAdapterPlate`.

    Each ring pin is a shoulder bolt threaded in from the <Z face into a
    heat-set insert: head counterbore + insert bore cut from <Z, with a
    clearance through-hole for the bolt's smooth shoulder (the disc's
    actual contact surface) spanning the rest of the housing thickness
    up to the disc-facing (>Z) face.
    """

    def __init__(
        self,
        num_ring_pins: int,
        ring_pin_diameter: float,
        ring_pin_circle_diameter: float,
        housing_thickness: float,
        input_bore_diameter: float,
        thread_size: ScrewSize,
        num_shell_bolts: int,
        shell_bolt_diameter: float,
        num_adapter_bolts: int,
        adapter_thread_size: ScrewSize,
        adapter_pilot_diameter: float,
        adapter_pilot_depth: float,
    ):
        self.num_ring_pins = num_ring_pins
        self.ring_pin_diameter = ring_pin_diameter
        self.ring_pin_circle_diameter = ring_pin_circle_diameter
        self.housing_thickness = housing_thickness
        self.input_bore_diameter = input_bore_diameter
        self.thread_size = thread_size
        self.num_shell_bolts = num_shell_bolts
        self.shell_bolt_diameter = shell_bolt_diameter
        self.num_adapter_bolts = num_adapter_bolts
        self.adapter_thread_size = adapter_thread_size
        self.adapter_pilot_diameter = adapter_pilot_diameter
        self.adapter_pilot_depth = adapter_pilot_depth

    @property
    def _ring_pin_outer_radius(self) -> float:
        return self.ring_pin_circle_diameter / 2 + self.ring_pin_diameter / 2

    @property
    def _shell_bolt_hole_radius(self) -> float:
        return HEAT_SET_INSERT_SPECS[self.thread_size].bore_diameter / 2

    @property
    def shell_bolt_circle_diameter(self) -> float:
        shell_bolt_radius = (
            self._ring_pin_outer_radius
            + _RING_PIN_TO_OUTER_BOLT_GAP
            + self._shell_bolt_hole_radius
        )
        return 2 * shell_bolt_radius

    @property
    def _adapter_bolt_hole_radius(self) -> float:
        return HEAT_SET_INSERT_SPECS[self.adapter_thread_size].bore_diameter / 2

    @property
    def adapter_bolt_circle_diameter(self) -> float:
        adapter_bolt_radius = (
            self._ring_pin_outer_radius
            + _RING_PIN_TO_OUTER_BOLT_GAP
            + self._adapter_bolt_hole_radius
        )
        return 2 * adapter_bolt_radius

    @property
    def footprint_diameter(self) -> float:
        ring_pin_span = 2 * self._ring_pin_outer_radius + 2 * _OUTER_BOLT_WALL_MARGIN
        shell_bolt_span = (
            self.shell_bolt_circle_diameter
            + 2 * self._shell_bolt_hole_radius
            + 2 * _OUTER_BOLT_WALL_MARGIN
        )
        adapter_bolt_span = (
            self.adapter_bolt_circle_diameter
            + 2 * self._adapter_bolt_hole_radius
            + 2 * _OUTER_BOLT_WALL_MARGIN
        )
        return max(ring_pin_span, shell_bolt_span, adapter_bolt_span)

    def cad(self) -> cadquery.Workplane:
        footprint_diameter = self.footprint_diameter

        housing = (
            cadquery.Workplane("XY")
            .circle(footprint_diameter / 2)
            .extrude(self.housing_thickness)
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

        # head counterbore + insert bore, cut from the <Z face where the
        # ring pin bolts are installed from
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

        # shell mounting bolt circle -- plain clearance, on the disc-facing
        # face
        shell_radius = self.shell_bolt_circle_diameter / 2
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

        # motor adapter plate's pilot recess, on the <Z face
        housing = (
            housing.faces("<Z")
            .workplane()
            .circle(self.adapter_pilot_diameter / 2)
            .cutBlind(-self.adapter_pilot_depth)
        )

        # motor adapter plate's bolt circle -- our own heat-set inserts,
        # on the <Z face
        adapter_insert_spec = HEAT_SET_INSERT_SPECS[self.adapter_thread_size]
        adapter_radius = self.adapter_bolt_circle_diameter / 2
        adapter_points = [
            (
                adapter_radius * math.cos(2 * math.pi * i / self.num_adapter_bolts),
                adapter_radius * math.sin(2 * math.pi * i / self.num_adapter_bolts),
            )
            for i in range(self.num_adapter_bolts)
        ]
        housing = (
            housing.faces("<Z")
            .workplane()
            .pushPoints(adapter_points)
            .hole(adapter_insert_spec.bore_diameter, depth=adapter_insert_spec.length)
        )

        return housing
