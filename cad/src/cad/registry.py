from functools import lru_cache
import inspect
from typing import Literal

from cad.assemblies import cycloidal_gearbox
from cad.objects import box
from cad.objects.cycloidal_gearbox import (
    bearing,
    cycloidal_disc,
    dowel_pin,
    input_shaft,
    output_flange,
    output_hub,
    ring_housing,
    shoulder_bolt,
)

objects = [
    box.Box,
    dowel_pin.DowelPin,
    bearing.Bearing,
    cycloidal_disc.CycloidalDisc,
    ring_housing.RingHousing,
    input_shaft.InputShaft,
    output_flange.OutputFlange,
    output_hub.OutputHub,
    shoulder_bolt.ShoulderBolt,
]
assemblies = [cycloidal_gearbox.CycloidalGearboxAssembly]


def raw_registry() -> dict[str, dict]:
    """likely not what you're looking for"""
    return {
        "objects": {
            obj.__name__: {
                "class": obj,
            }
            for obj in objects
        },
        "assemblies": {
            obj.__name__: {
                "class": obj,
            }
            for obj in assemblies
        },
    }


@lru_cache
def registry():
    registry_ = raw_registry()

    def __build_params(type_: Literal["objects", "assemblies"]):
        for obj, data in registry_[type_].items():
            sig = inspect.signature(data.get("class").__init__)
            data["params"] = {}
            for name, param in sig.parameters.items():
                if name == "self":
                    continue
                data["params"][name] = {
                    "type": param.annotation,
                    "required": param.default is inspect.Parameter.empty,
                }
                if not data["params"][name]["required"]:
                    data["params"][name]["default"] = param.default

    __build_params("assemblies")
    __build_params("objects")

    return registry_
