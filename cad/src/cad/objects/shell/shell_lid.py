import math

import cadquery
from machinewright import CADObject, register_object
from machinewright.lib.fasteners import HEAT_SET_INSERT_SPECS, ScrewSize

from cad.lib.materials import PRINTED

_SENSOR_POCKET_DEPTH = 2.5  # local to this part -- doesn't depend on any other part's geometry, unlike sensor_mount_radius
_SENSOR_POCKET_MARGIN = 2.0


@register_object
class ShellLid(CADObject):
    """
    Caps the far (output) end of a ShellBody tube. Plain clearance holes
    on the same bolt circle as the tube -- the tube carries the insert,
    matching how the ring housing's shell holes stay plain too. A
    central bore lets the OutputHub's shaft pass through.

    The inward (<Z) face also carries a mount for the encoder sensor
    board: a shallow pocket (so the board's active side sits close to
    OutputFlange's ring magnet, which is recessed flush on the opposing
    face just across the assembly gap) plus corner standoffs, same
    heat-set-insert-in-a-boss pattern as the electronics BoardMount.
    Sized around an Infineon TLE5012B breakout (PG-DSO-8, ~5.7x6mm
    body) -- its GMR bridge reads the local field direction, so it
    works off-axis against a ring magnet the same way it works on-axis
    against a shaft-end magnet.

    Placed at `sensor_mount_angle`, not angle 0 -- the roller pin bolt
    heads land at 0, 360/n, 720/n... around the same face, and a sensor
    parked at 0 sits directly on top of the first one. The gearbox
    supplies the actual angle (the midpoint between two roller pins).
    """

    material = PRINTED

    def __init__(
        self,
        outer_diameter: float,
        thickness: float,
        bolt_circle_diameter: float,
        num_bolts: int,
        bolt_hole_diameter: float,
        output_clearance_diameter: float,
        sensor_mount_radius: float,
        sensor_mount_angle: float,
        sensor_board_width: float,
        sensor_board_length: float,
        sensor_hole_inset: float,
        sensor_thread_size: ScrewSize,
    ):
        self.outer_diameter = outer_diameter
        self.thickness = thickness
        self.bolt_circle_diameter = bolt_circle_diameter
        self.num_bolts = num_bolts
        self.bolt_hole_diameter = bolt_hole_diameter
        self.output_clearance_diameter = output_clearance_diameter
        self.sensor_mount_radius = sensor_mount_radius
        self.sensor_mount_angle = sensor_mount_angle
        self.sensor_board_width = sensor_board_width
        self.sensor_board_length = sensor_board_length
        self.sensor_hole_inset = sensor_hole_inset
        self.sensor_thread_size = sensor_thread_size

    def cad(self) -> cadquery.Workplane:
        lid = (
            cadquery.Workplane("XY")
            .circle(self.outer_diameter / 2)
            .extrude(self.thickness)
        )

        bolt_radius = self.bolt_circle_diameter / 2
        bolt_points = [
            (
                bolt_radius * math.cos(2 * math.pi * i / self.num_bolts),
                bolt_radius * math.sin(2 * math.pi * i / self.num_bolts),
            )
            for i in range(self.num_bolts)
        ]
        lid = (
            lid.faces(">Z")
            .workplane()
            .pushPoints(bolt_points)
            .hole(self.bolt_hole_diameter)
        )

        lid = lid.faces(">Z").workplane().hole(self.output_clearance_diameter)

        # sensor board pocket, recessed into the <Z face at the radius
        # that lines up with OutputFlange's encoder target ring, and at
        # `sensor_mount_angle` -- NOT angle 0, which is where the first
        # roller pin bolt head lands. The workplane is rotated to that
        # angle first so the pocket (and its standoffs, below) come out
        # aligned to the radial direction there, not just translated
        # along the original X axis.
        #
        # The angle is NEGATED here specifically: a workplane built on a
        # <Z-selected face has flipped handedness relative to a plain
        # Workplane("XY") (confirmed empirically -- a +30 request here
        # cuts the pocket at world angle -30). Every other angle in this
        # codebase (roller pins, ring pins, the sensor board placeholder
        # in ShellAssembly) is placed with plain cos/sin math, which
        # doesn't go through a face-derived workplane and has no such
        # flip. Negating here, once, keeps this the only place that has
        # to know about the quirk.
        pocket_width = self.sensor_board_width + 2 * _SENSOR_POCKET_MARGIN
        pocket_length = self.sensor_board_length + 2 * _SENSOR_POCKET_MARGIN
        lid = (
            lid.faces("<Z")
            .workplane()
            .transformed(rotate=(0, 0, -self.sensor_mount_angle))
            .center(self.sensor_mount_radius, 0)
            .rect(pocket_width, pocket_length)
            .cutBlind(-_SENSOR_POCKET_DEPTH)
        )

        # corner standoffs for the board's own mounting screws, same
        # four-corner heat-set-insert pattern as BoardMount
        insert_spec = HEAT_SET_INSERT_SPECS[self.sensor_thread_size]
        standoff_x = self.sensor_board_width / 2 - self.sensor_hole_inset
        standoff_y = self.sensor_board_length / 2 - self.sensor_hole_inset
        standoff_points = [
            (self.sensor_mount_radius + x, y)
            for x in (-standoff_x, standoff_x)
            for y in (-standoff_y, standoff_y)
        ]
        lid = (
            lid.faces("<Z")
            .workplane()
            .transformed(rotate=(0, 0, -self.sensor_mount_angle))
            .pushPoints(standoff_points)
            .hole(insert_spec.bore_diameter, depth=_SENSOR_POCKET_DEPTH + insert_spec.length)
        )

        return lid
