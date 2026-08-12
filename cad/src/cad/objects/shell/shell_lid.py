import math

import cadquery
from machinewright import CADObject, register_object


@register_object
class ShellLid(CADObject):
    """
    Caps the far (output) end of a ShellBody tube. Plain clearance holes
    on the same bolt circle as the tube -- the tube carries the insert,
    matching how the ring housing's shell holes stay plain too. A
    central bore lets the OutputHub's shaft pass through.
    """

    def __init__(
        self,
        outer_diameter: float,
        thickness: float,
        bolt_circle_diameter: float,
        num_bolts: int,
        bolt_hole_diameter: float,
        output_clearance_diameter: float,
    ):
        self.outer_diameter = outer_diameter
        self.thickness = thickness
        self.bolt_circle_diameter = bolt_circle_diameter
        self.num_bolts = num_bolts
        self.bolt_hole_diameter = bolt_hole_diameter
        self.output_clearance_diameter = output_clearance_diameter

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

        return lid
