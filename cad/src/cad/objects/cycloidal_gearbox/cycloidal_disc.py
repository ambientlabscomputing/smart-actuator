import math

import cadquery
from machinewright import CADObject, register_object

from cad.lib.cycloidal import cycloidal_disc_profile


@register_object
class CycloidalDisc(CADObject):
    def __init__(
        self,
        num_ring_pins: int,
        ring_pin_diameter: float,
        ring_pin_circle_diameter: float,
        eccentricity: float,
        thickness: float,
        center_bore_diameter: float,
        num_output_holes: int,
        output_hole_diameter: float,
        output_hole_circle_diameter: float,
    ):
        self.num_ring_pins = num_ring_pins
        self.ring_pin_diameter = ring_pin_diameter
        self.ring_pin_circle_diameter = ring_pin_circle_diameter
        self.eccentricity = eccentricity
        self.thickness = thickness
        self.center_bore_diameter = center_bore_diameter
        self.num_output_holes = num_output_holes
        self.output_hole_diameter = output_hole_diameter
        self.output_hole_circle_diameter = output_hole_circle_diameter

    def cad(self) -> cadquery.Workplane:
        profile = cycloidal_disc_profile(
            num_ring_pins=self.num_ring_pins,
            ring_pin_radius=self.ring_pin_diameter / 2,
            ring_pin_circle_radius=self.ring_pin_circle_diameter / 2,
            eccentricity=self.eccentricity,
        )

        disc = (
            cadquery.Workplane("XY").polyline(profile).close().extrude(self.thickness)
        )

        disc = disc.faces(">Z").workplane().hole(self.center_bore_diameter)

        output_radius = self.output_hole_circle_diameter / 2
        output_points = [
            (
                output_radius * math.cos(2 * math.pi * i / self.num_output_holes),
                output_radius * math.sin(2 * math.pi * i / self.num_output_holes),
            )
            for i in range(self.num_output_holes)
        ]
        disc = (
            disc.faces(">Z")
            .workplane()
            .pushPoints(output_points)
            .hole(self.output_hole_diameter)
        )

        return disc
