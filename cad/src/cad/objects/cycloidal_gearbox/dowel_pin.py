import cadquery

from cad.objects.base import CADObject


class DowelPin(CADObject):
    def __init__(self, diameter: float, length: float):
        self.diameter = diameter
        self.length = length

    def cad(self) -> cadquery.Workplane:
        return cadquery.Workplane("XY").circle(self.diameter / 2).extrude(self.length)
