import cadquery
from machinewright import CADObject, register_object

from cad.lib.materials import PRINTED
from cad.lib.nema import NEMA_SPECS, NemaSize

_COUPLER_WALL_THICKNESS = 3.0


@register_object
class InputShaft(CADObject):
    """
    Couples to the NEMA motor's output shaft at one end, and carries an
    eccentric boss (offset from the rotation axis by `eccentricity`) at
    the other end that the eccentric bearing / cycloidal disc rides on.

    The coupler ends exactly where the disc begins and the eccentric
    spans exactly the disc's own axial slice, so the shaft stops at the
    disc's outer face instead of reaching on into the output flange's
    volume -- the shaft turns at input speed and the flange at output
    speed, so any shared volume there is a collision.
    """

    material = PRINTED

    def __init__(
        self,
        nema_size: NemaSize,
        eccentricity: float,
        eccentric_boss_diameter: float,
        set_screw_hole_diameter: float,
        coupler_length: float,
        eccentric_section_length: float,
    ):
        self.nema_size = nema_size
        self.eccentricity = eccentricity
        self.eccentric_boss_diameter = eccentric_boss_diameter
        self.set_screw_hole_diameter = set_screw_hole_diameter
        self.coupler_length = coupler_length
        self.eccentric_section_length = eccentric_section_length

    @property
    def shaft_length(self) -> float:
        return self.coupler_length + self.eccentric_section_length

    def cad(self) -> cadquery.Workplane:
        spec = NEMA_SPECS[self.nema_size]

        coupler_od = spec.shaft_diameter + 2 * _COUPLER_WALL_THICKNESS

        shaft = (
            cadquery.Workplane("XY").circle(coupler_od / 2).extrude(self.coupler_length)
        )

        # bore that receives the NEMA motor's output shaft
        shaft = (
            shaft.faces("<Z")
            .workplane()
            .hole(spec.shaft_diameter, depth=self.coupler_length)
        )

        # radial set-screw hole through the coupler wall, midway up
        set_screw_wp = cadquery.Workplane("XZ").center(0, self.coupler_length / 2)
        shaft = shaft.cut(
            set_screw_wp.circle(self.set_screw_hole_diameter / 2).extrude(coupler_od)
        )

        # eccentric boss, offset from the shaft's rotation axis by
        # `eccentricity` -- this is what the bearing (and cycloidal disc)
        # ride on.
        eccentric = (
            cadquery.Workplane(
                "XY", origin=(self.eccentricity, 0, self.coupler_length)
            )
            .circle(self.eccentric_boss_diameter / 2)
            .extrude(self.eccentric_section_length)
        )

        return shaft.union(eccentric)
