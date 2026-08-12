import math

import cadquery
from machinewright import CADObject, register_object
from machinewright.lib.fasteners import SHOULDER_BOLT_SPECS, ScrewSize

from cad.lib.nema import NEMA_SPECS, NemaSize

_WALL_MARGIN = 4.0
_HOUSING_BOLT_CLEARANCE = 0.4


@register_object
class MotorAdapterPlate(CADObject):
    """
    Thin, NEMA-specific adapter between the motor and the (NEMA-agnostic)
    `RingHousing`. Motor-facing (<Z) side carries the standard NEMA pilot
    recess and bolt clearance holes -- threads live in the motor, same as
    before. Housing-facing (>Z) side carries a pilot boss (registers into
    `RingHousing`'s matching recess) and clearance holes for the bolts
    that thread into the housing's own inserts.

    Swapping motor sizes only means swapping this plate -- the housing,
    and everything built on it, doesn't change.
    """

    def __init__(
        self,
        nema_size: NemaSize,
        thickness: float,
        input_bore_diameter: float,
        num_housing_bolts: int,
        housing_bolt_circle_diameter: float,
        housing_thread_size: ScrewSize,
        housing_pilot_diameter: float,
        housing_pilot_depth: float,
    ):
        self.nema_size = nema_size
        self.thickness = thickness
        self.input_bore_diameter = input_bore_diameter
        self.num_housing_bolts = num_housing_bolts
        self.housing_bolt_circle_diameter = housing_bolt_circle_diameter
        self.housing_thread_size = housing_thread_size
        self.housing_pilot_diameter = housing_pilot_diameter
        self.housing_pilot_depth = housing_pilot_depth

    @property
    def _housing_bolt_hole_radius(self) -> float:
        return (
            SHOULDER_BOLT_SPECS[self.housing_thread_size].thread_diameter / 2
            + _HOUSING_BOLT_CLEARANCE / 2
        )

    @property
    def plate_diameter(self) -> float:
        spec = NEMA_SPECS[self.nema_size]
        nema_span = (
            spec.bolt_spacing * math.sqrt(2) + spec.bolt_hole_diameter + 2 * _WALL_MARGIN
        )
        housing_bolt_span = (
            self.housing_bolt_circle_diameter
            + 2 * self._housing_bolt_hole_radius
            + 2 * _WALL_MARGIN
        )
        return max(nema_span, housing_bolt_span)

    def cad(self) -> cadquery.Workplane:
        spec = NEMA_SPECS[self.nema_size]

        plate = (
            cadquery.Workplane("XY")
            .circle(self.plate_diameter / 2)
            .extrude(self.thickness)
        )

        # motor-facing <Z: pilot recess + NEMA bolt clearance holes,
        # threads live in the motor
        plate = (
            plate.faces("<Z")
            .workplane()
            .circle(spec.pilot_boss_diameter / 2)
            .cutBlind(-spec.pilot_boss_depth)
        )

        half_spacing = spec.bolt_spacing / 2
        nema_points = [
            (x, y)
            for x in (-half_spacing, half_spacing)
            for y in (-half_spacing, half_spacing)
        ]
        plate = (
            plate.faces("<Z")
            .workplane()
            .pushPoints(nema_points)
            .hole(spec.bolt_hole_diameter)
        )

        # housing-facing >Z: pilot boss registers into RingHousing's
        # matching recess
        pilot_boss = cadquery.Workplane(
            "XY", origin=(0, 0, self.thickness)
        ).circle(self.housing_pilot_diameter / 2).extrude(self.housing_pilot_depth)
        plate = plate.union(pilot_boss)

        # housing bolt clearance holes -- the housing carries the insert
        housing_radius = self.housing_bolt_circle_diameter / 2
        housing_points = [
            (
                housing_radius * math.cos(2 * math.pi * i / self.num_housing_bolts),
                housing_radius * math.sin(2 * math.pi * i / self.num_housing_bolts),
            )
            for i in range(self.num_housing_bolts)
        ]
        plate = (
            plate.faces(">Z")
            .workplane()
            .pushPoints(housing_points)
            .hole(2 * self._housing_bolt_hole_radius)
        )

        # central bore for the motor shaft / input shaft coupler to pass
        # through, cut last so it goes through the pilot boss too
        plate = plate.faces(">Z").workplane().hole(self.input_bore_diameter)

        return plate
