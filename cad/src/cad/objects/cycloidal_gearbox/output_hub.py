import math

import cadquery

from cad.objects.base import CADObject


class OutputHub(CADObject):
    """
    Metal, machined/purchased output hub -- not printed. Bolts to the
    printed OutputFlange's outward face so the actual output shaft, and
    the torque it carries, never passes through printed plastic. A pilot
    boss (protruding below local z=0) registers concentrically into the
    flange's pilot recess; bolt holes are blind, representing tapped
    holes cut directly into the metal (no insert needed). The output
    shaft continues outward above the flange disc.
    """

    def __init__(
        self,
        shaft_diameter: float,
        shaft_length: float,
        flange_diameter: float,
        flange_thickness: float,
        pilot_diameter: float,
        pilot_height: float,
        num_bolts: int,
        bolt_circle_diameter: float,
        bolt_hole_diameter: float,
    ):
        self.shaft_diameter = shaft_diameter
        self.shaft_length = shaft_length
        self.flange_diameter = flange_diameter
        self.flange_thickness = flange_thickness
        self.pilot_diameter = pilot_diameter
        self.pilot_height = pilot_height
        self.num_bolts = num_bolts
        self.bolt_circle_diameter = bolt_circle_diameter
        self.bolt_hole_diameter = bolt_hole_diameter

    def cad(self) -> cadquery.Workplane:
        flange = (
            cadquery.Workplane("XY")
            .circle(self.flange_diameter / 2)
            .extrude(self.flange_thickness)
        )

        pilot = (
            cadquery.Workplane("XY", origin=(0, 0, -self.pilot_height))
            .circle(self.pilot_diameter / 2)
            .extrude(self.pilot_height)
        )
        flange = flange.union(pilot)

        bolt_radius = self.bolt_circle_diameter / 2
        bolt_points = [
            (
                bolt_radius * math.cos(2 * math.pi * i / self.num_bolts),
                bolt_radius * math.sin(2 * math.pi * i / self.num_bolts),
            )
            for i in range(self.num_bolts)
        ]
        flange = (
            flange.faces(">Z")
            .workplane()
            .pushPoints(bolt_points)
            .hole(self.bolt_hole_diameter, depth=self.flange_thickness)
        )

        shaft = (
            cadquery.Workplane("XY", origin=(0, 0, self.flange_thickness))
            .circle(self.shaft_diameter / 2)
            .extrude(self.shaft_length)
        )

        return flange.union(shaft)
