import cadquery

from cad.objects.base import CADObject


class Bearing(CADObject):
    """
    Simplified stand-in shape for an off-the-shelf ball/needle bearing --
    used for assembly clearance checks and visualization, not as a
    manufacturable part.
    """

    def __init__(self, outer_diameter: float, inner_diameter: float, width: float):
        self.outer_diameter = outer_diameter
        self.inner_diameter = inner_diameter
        self.width = width

    def cad(self) -> cadquery.Workplane:
        return (
            cadquery.Workplane("XY")
            .circle(self.outer_diameter / 2)
            .circle(self.inner_diameter / 2)
            .extrude(self.width)
        )
