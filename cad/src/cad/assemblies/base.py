from abc import abstractmethod

import cadquery

from cad.lib.cadq.exportable import Exportable


class CADAssembly(Exportable):
    @abstractmethod
    def assemble(self) -> cadquery.Assembly:
        """
        Returns the cadquery Assembly with all child parts positioned
        """

    def assemble_exploded(
        self,
        spacing: float = 30.0,
        axis: tuple[float, float, float] = (0, 0, 1),
    ) -> cadquery.Assembly:
        """
        Generic axial exploded view: groups children by their position
        along `axis` (parts that share a position stay together, e.g. a
        ring of pins), ranks the distinct positions in order, and spreads
        those ranks `spacing` apart along `axis`. Position perpendicular to
        `axis` is left untouched, so parts stay in their rotational/radial
        place while the assembly's layers pull apart along the stack axis.
        """
        assy = self.assemble()
        axis_vec = cadquery.Vector(*axis).normalized()

        def axial_position(child) -> float:
            center = child.obj.val().located(child.loc).BoundingBox().center
            return round(center.dot(axis_vec), 3)

        ranks = {
            pos: i
            for i, pos in enumerate(sorted({axial_position(c) for c in assy.children}))
        }

        exploded = cadquery.Assembly()
        for child in assy.children:
            pos = axial_position(child)
            shift = axis_vec * (ranks[pos] * spacing - pos)
            exploded.add(
                child.obj, loc=cadquery.Location(shift) * child.loc, name=child.name
            )

        return exploded

    def cad(self, exploded: bool = False, spacing: float = 30.0) -> cadquery.Workplane:
        assy = self.assemble_exploded(spacing=spacing) if exploded else self.assemble()
        return cadquery.Workplane(obj=assy.toCompound())
