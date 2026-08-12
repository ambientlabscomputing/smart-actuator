from functools import lru_cache
import inspect
from typing import Literal

from cad.objects import box

objects = [box.Box]


def raw_registry() -> dict[str, dict]:
    """likely not what you're looking for"""
    return {
        "objects": {
            obj.__name__: {
                "class": obj,
            }
            for obj in objects
        },
        "assemblies": {},
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
                    "required": param.default is None,
                }
                if not data["params"][name]["required"]:
                    data["params"][name]["default"] = param.default

    # __build_params("assemblies")  # enable assembly
    __build_params("objects")

    return registry_
