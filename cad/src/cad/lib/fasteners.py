"""
Socket head shoulder screw + heat-set threaded insert dimensions.

These are common catalog values (ISO 4762-style SHCS head/socket
proportions, typical FDM knurled brass insert sizes), not pulled from
one specific vendor's datasheet. Verify against the actual hardware
you're buying before printing anything the insert has to melt into --
insert bore diameter in particular is sensitive to your printer/nozzle
and the exact insert you bought.
"""

from dataclasses import dataclass
from enum import Enum


class ScrewSize(str, Enum):
    M3 = "M3"
    M4 = "M4"
    M5 = "M5"


@dataclass(frozen=True)
class ShoulderBoltSpec:
    thread_diameter: float  # nominal major thread diameter, mm
    head_diameter: float  # mm
    head_height: float  # mm
    socket_diameter: float  # hex socket, across-flats, mm
    socket_depth: float  # mm


@dataclass(frozen=True)
class HeatSetInsertSpec:
    bore_diameter: float  # diameter to print for the insert to melt into, mm
    length: float  # insert depth, mm


SHOULDER_BOLT_SPECS: dict[ScrewSize, ShoulderBoltSpec] = {
    ScrewSize.M3: ShoulderBoltSpec(
        thread_diameter=3.0,
        head_diameter=5.5,
        head_height=3.0,
        socket_diameter=2.5,
        socket_depth=1.5,
    ),
    ScrewSize.M4: ShoulderBoltSpec(
        thread_diameter=4.0,
        head_diameter=7.0,
        head_height=4.0,
        socket_diameter=3.0,
        socket_depth=2.0,
    ),
    ScrewSize.M5: ShoulderBoltSpec(
        thread_diameter=5.0,
        head_diameter=8.5,
        head_height=5.0,
        socket_diameter=4.0,
        socket_depth=2.5,
    ),
}

HEAT_SET_INSERT_SPECS: dict[ScrewSize, HeatSetInsertSpec] = {
    ScrewSize.M3: HeatSetInsertSpec(bore_diameter=4.0, length=5.7),
    ScrewSize.M4: HeatSetInsertSpec(bore_diameter=5.6, length=8.1),
    ScrewSize.M5: HeatSetInsertSpec(bore_diameter=6.4, length=9.5),
}
