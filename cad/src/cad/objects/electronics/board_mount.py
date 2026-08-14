import math

import cadquery
from machinewright import CADObject, register_object
from machinewright.lib.fasteners import HEAT_SET_INSERT_SPECS, ScrewSize

from cad.lib.materials import PRINTED

_BOARD_MARGIN = 6.0
_STANDOFF_WALL = 4.0


@register_object
class BoardMount(CADObject):
    """
    Generic board-mount plate -- every board is just different numbers
    for this same object, no board catalog/lookup needed. Four corner
    standoffs (heat-set inserts, `thread_size`) at `hole_inset` from the
    board's own edges take the board's mounting screws. The plate's own
    outer bolt circle bolts it over a `ShellBody` pod opening from
    outside, doubling as that pod's cover.
    """

    material = PRINTED

    def __init__(
        self,
        board_width: float,
        board_length: float,
        hole_inset: float,
        standoff_height: float,
        plate_thickness: float,
        thread_size: ScrewSize,
        num_mount_bolts: int,
        mount_bolt_circle_diameter: float,
        mount_bolt_diameter: float,
    ):
        self.board_width = board_width
        self.board_length = board_length
        self.hole_inset = hole_inset
        self.standoff_height = standoff_height
        self.plate_thickness = plate_thickness
        self.thread_size = thread_size
        self.num_mount_bolts = num_mount_bolts
        self.mount_bolt_circle_diameter = mount_bolt_circle_diameter
        self.mount_bolt_diameter = mount_bolt_diameter

    @property
    def plate_width(self) -> float:
        return max(
            self.board_width + 2 * _BOARD_MARGIN,
            self.mount_bolt_circle_diameter + self.mount_bolt_diameter + 2 * _BOARD_MARGIN,
        )

    @property
    def plate_length(self) -> float:
        return max(
            self.board_length + 2 * _BOARD_MARGIN,
            self.mount_bolt_circle_diameter + self.mount_bolt_diameter + 2 * _BOARD_MARGIN,
        )

    def cad(self) -> cadquery.Workplane:
        plate = (
            cadquery.Workplane("XY")
            .rect(self.plate_width, self.plate_length)
            .extrude(self.plate_thickness)
        )

        # outer mount bolt circle -- plain clearance, threads into the
        # shell pod's insert
        mount_radius = self.mount_bolt_circle_diameter / 2
        mount_points = [
            (
                mount_radius * math.cos(2 * math.pi * i / self.num_mount_bolts),
                mount_radius * math.sin(2 * math.pi * i / self.num_mount_bolts),
            )
            for i in range(self.num_mount_bolts)
        ]
        plate = (
            plate.faces(">Z")
            .workplane()
            .pushPoints(mount_points)
            .hole(self.mount_bolt_diameter)
        )

        # four corner standoffs for the board's own mounting screws
        insert_spec = HEAT_SET_INSERT_SPECS[self.thread_size]
        standoff_diameter = insert_spec.bore_diameter + 2 * _STANDOFF_WALL
        standoff_x = self.board_width / 2 - self.hole_inset
        standoff_y = self.board_length / 2 - self.hole_inset
        standoff_points = [
            (x, y) for x in (-standoff_x, standoff_x) for y in (-standoff_y, standoff_y)
        ]

        standoffs = (
            cadquery.Workplane("XY", origin=(0, 0, self.plate_thickness))
            .pushPoints(standoff_points)
            .circle(standoff_diameter / 2)
            .extrude(self.standoff_height)
        )
        plate = plate.union(standoffs)

        plate = (
            plate.faces(">Z")
            .workplane()
            .pushPoints(standoff_points)
            .hole(insert_spec.bore_diameter, depth=insert_spec.length)
        )

        return plate
