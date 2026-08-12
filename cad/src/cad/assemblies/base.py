from abc import abstractmethod

import cadquery

from cad.lib.cadq.exportable import Exportable


def _explode_assembly(
    assy: cadquery.Assembly,
    spacing: float,
    axis_vec: cadquery.Vector,
    nested: bool,
) -> cadquery.Assembly:
    """
    Works on a raw cadquery.Assembly tree (not tied to our CADAssembly
    class), so it can recurse into nested sub-assemblies -- built by
    some other CADAssembly's own assemble() -- the same way it handles
    top-level children.
    """

    def child_shape(child):
        # leaf children (a Workplane/Shape in .obj) store their loc
        # separately and need it applied; nested sub-assemblies
        # (.obj is None -- their geometry lives in their own
        # children) already bake their own .loc into toCompound()
        if child.obj is not None:
            return child.obj.val().located(child.loc)
        return child.toCompound()

    positions = {
        id(child): round(child_shape(child).BoundingBox().center.dot(axis_vec), 3)
        for child in assy.children
    }

    ranks = {pos: i for i, pos in enumerate(sorted(set(positions.values())))}

    exploded = cadquery.Assembly()
    for child in assy.children:
        pos = positions[id(child)]
        shift = axis_vec * (ranks[pos] * spacing - pos)
        new_loc = cadquery.Location(shift) * child.loc

        if child.obj is None and nested:
            # recurse in child's own local frame (child.loc is applied
            # separately above, via new_loc, when adding the result)
            inner = _explode_assembly(child, spacing, axis_vec, nested=True)
            exploded.add(inner, loc=new_loc, name=child.name)
        else:
            target = child.obj if child.obj is not None else child
            exploded.add(target, loc=new_loc, name=child.name)

    return exploded


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
        nested: bool = False,
    ) -> cadquery.Assembly:
        """
        Generic axial exploded view: groups children by their position
        along `axis` (parts that share a position stay together, e.g. a
        ring of pins), ranks the distinct positions in order, and spreads
        those ranks `spacing` apart along `axis`. Position perpendicular to
        `axis` is left untouched, so parts stay in their rotational/radial
        place while the assembly's layers pull apart along the stack axis.

        `nested=True` also explodes the internals of any nested
        sub-assemblies (e.g. ActuatorAssembly's gearbox/shell/electronics
        children), instead of treating each as one rigid block.
        """
        assy = self.assemble()
        axis_vec = cadquery.Vector(*axis).normalized()
        return _explode_assembly(assy, spacing, axis_vec, nested)

    def cad(
        self, exploded: bool = False, spacing: float = 30.0, nested: bool = False
    ) -> cadquery.Workplane:
        assy = (
            self.assemble_exploded(spacing=spacing, nested=nested)
            if exploded
            else self.assemble()
        )
        return cadquery.Workplane(obj=assy.toCompound())
