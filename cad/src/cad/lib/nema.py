"""
NEMA stepper motor faceplate dimensions.

These are commonly published NEMA standard values (mm). Verify the
specific values against the actual motor's datasheet before printing
anything that has to bolt onto it -- pilot boss diameter and bolt
spacing tolerances vary slightly between manufacturers.
"""

from dataclasses import dataclass
from enum import Enum


class NemaSize(str, Enum):
    NEMA14 = "14"
    NEMA17 = "17"
    NEMA23 = "23"
    NEMA34 = "34"


@dataclass(frozen=True)
class NemaSpec:
    faceplate_width: float  # square face, mm
    bolt_spacing: float  # bolt-to-bolt on the square mounting pattern, mm
    bolt_hole_diameter: float  # clearance hole diameter, mm
    pilot_boss_diameter: float  # shaft-centering spigot diameter, mm
    pilot_boss_depth: float  # spigot recess depth, mm
    shaft_diameter: float  # motor output shaft diameter, mm


NEMA_SPECS: dict[NemaSize, NemaSpec] = {
    NemaSize.NEMA14: NemaSpec(
        faceplate_width=35.2,
        bolt_spacing=26.0,
        bolt_hole_diameter=3.2,
        pilot_boss_diameter=22.0,
        pilot_boss_depth=2.0,
        shaft_diameter=5.0,
    ),
    NemaSize.NEMA17: NemaSpec(
        faceplate_width=42.3,
        bolt_spacing=31.0,
        bolt_hole_diameter=3.2,
        pilot_boss_diameter=22.0,
        pilot_boss_depth=2.0,
        shaft_diameter=5.0,
    ),
    NemaSize.NEMA23: NemaSpec(
        faceplate_width=56.4,
        bolt_spacing=47.14,
        bolt_hole_diameter=5.2,
        pilot_boss_diameter=38.1,
        pilot_boss_depth=1.6,
        shaft_diameter=6.35,
    ),
    NemaSize.NEMA34: NemaSpec(
        faceplate_width=86.0,
        bolt_spacing=69.6,
        bolt_hole_diameter=5.2,
        pilot_boss_diameter=73.0,
        pilot_boss_depth=1.6,
        shaft_diameter=12.7,
    ),
}
