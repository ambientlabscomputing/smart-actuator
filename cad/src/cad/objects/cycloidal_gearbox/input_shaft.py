import cadquery
from machinewright import CADObject, register_object

from cad.lib.nema import NEMA_SPECS, NemaSize


@register_object
class InputShaft(CADObject):
    """
    Couples to the NEMA motor's output shaft at one end, and carries an
    eccentric boss (offset from the rotation axis by `eccentricity`) at
    the other end that the eccentric bearing / cycloidal disc rides on.
    """

    def __init__(
        self,
        nema_size: NemaSize,
        eccentricity: float,
        eccentric_boss_diameter: float,
        shaft_length: float,
        set_screw_hole_diameter: float,
    ):
        self.nema_size = nema_size
        self.eccentricity = eccentricity
        self.eccentric_boss_diameter = eccentric_boss_diameter
        self.shaft_length = shaft_length
        self.set_screw_hole_diameter = set_screw_hole_diameter

    def cad(self) -> cadquery.Workplane:
        spec = NEMA_SPECS[self.nema_size]

        coupler_wall_thickness = 3.0
        coupler_od = spec.shaft_diameter + 2 * coupler_wall_thickness
        coupler_length = self.shaft_length / 2
        eccentric_length = self.shaft_length - coupler_length

        coupler = (
            cadquery.Workplane("XY").circle(coupler_od / 2).extrude(coupler_length)
        )

        # bore that receives the NEMA motor's output shaft
        coupler = (
            coupler.faces("<Z")
            .workplane()
            .hole(spec.shaft_diameter, depth=coupler_length)
        )

        # radial set-screw hole through the coupler wall, midway up
        set_screw_z = coupler_length / 2
        set_screw_wp = cadquery.Workplane("XZ").center(0, set_screw_z)
        coupler = coupler.cut(
            set_screw_wp.circle(self.set_screw_hole_diameter / 2).extrude(coupler_od)
        )

        # eccentric boss, offset from the shaft's rotation axis by
        # `eccentricity` -- this is what the bearing (and cycloidal disc)
        # ride on.
        eccentric = (
            cadquery.Workplane("XY", origin=(self.eccentricity, 0, coupler_length))
            .circle(self.eccentric_boss_diameter / 2)
            .extrude(eccentric_length)
        )

        return coupler.union(eccentric)
