import cadquery

from cad.objects.base import CADObject


class Box(CADObject):
    def __init__(self, height: float, width: float, depth: float):
        self.height = height
        self.width = width
        self.depth = depth

    def cad(self) -> cadquery.Workplane:
        return cadquery.Workplane("XY").box(
            length=self.depth,
            width=self.width,
            height=self.height,
        )
