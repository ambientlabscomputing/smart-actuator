from datetime import UTC, datetime
import json
import os
import tempfile

import cadquery
from cadquery import exporters
import typer

from cad.assemblies.base import CADAssembly
from cad.commands.ui import print
from cad.lib.cadq import exports
from cad.registry import registry

export = typer.Typer()

_EXTENSION_BY_TYPE: dict[str, str] = {
    exporters.ExportTypes.STL: "stl",
    exporters.ExportTypes.STEP: "step",
    exporters.ExportTypes.AMF: "amf",
    exporters.ExportTypes.SVG: "svg",
    exporters.ExportTypes.TJS: "tjs",
    exporters.ExportTypes.DXF: "dxf",
    exporters.ExportTypes.VRML: "wrl",
    exporters.ExportTypes.VTP: "vtp",
    exporters.ExportTypes.THREEMF: "3mf",
    exporters.ExportTypes.BREP: "brep",
    exporters.ExportTypes.BIN: "bin",
}


def _instantiate(identifier: str, params: str | None):
    type_, name = identifier.split(".", 1)
    reg = registry()
    obj = None
    for cls_name, data in reg[type_].items():
        if cls_name.lower() == name.lower():
            obj = data["class"]
            break
    if not obj:
        print(f"{identifier} not found in registry")
        return None

    params_: dict = {} if params is None else json.loads(params)
    return obj(**params_)


def _resolve_location(identifier: str, location: str | None, extension: str) -> str:
    if location:
        return location
    temp_dir = tempfile.mkdtemp()
    location = os.path.join(
        temp_dir, f"{identifier}-{datetime.now(UTC).isoformat()}.{extension}"
    )
    print(f"No location given, exporting to {location}")
    return location


def _cad(
    inst, exploded: bool, explode_spacing: float, explode_nested: bool
) -> cadquery.Workplane:
    if exploded:
        if not isinstance(inst, CADAssembly):
            print("--exploded only applies to assemblies; exporting normally")
        else:
            return inst.cad(
                exploded=True, spacing=explode_spacing, nested=explode_nested
            )
    return inst.cad()


@export.command("svg", help="Render and export image to SVG format")
def export_svg(
    identifier: str,
    location: str | None = None,
    params: str | None = None,
    width: int = 300,
    height: int = 300,
    margin_left: int = 10,
    margin_top: int = 10,
    show_axes: bool = False,
    stroke_width: float = 0.25,
    show_hidden: bool = True,
    stroke_color: tuple[float, float, float] = (0, 0, 0),
    hidden_color: tuple[float, float, float] = (0, 0, 200),
    projection_dir: tuple[float, float, float] = (-1.75, 1.1, 5),
    exploded: bool = False,
    explode_spacing: float = 30.0,
    explode_nested: bool = False,
):
    inst = _instantiate(identifier, params)
    if inst is None:
        return None

    location = _resolve_location(identifier, location, "svg")
    return exports.svg(
        cad=_cad(inst, exploded, explode_spacing, explode_nested),
        svg_opts=exports.SVGOpts(
            width=width,
            height=height,
            marginLeft=margin_left,
            marginTop=margin_top,
            showAxes=show_axes,
            strokeWidth=stroke_width,
            showHidden=show_hidden,
            strokeColor=stroke_color,
            hiddenColor=hidden_color,
            projectionDir=projection_dir,
        ),
        export_location=location,
    )


@export.command("step", help="Export to STEP format")
def export_step(
    identifier: str,
    location: str | None = None,
    params: str | None = None,
    unit: cadquery.types.UnitLiterals = "MM",
    output_unit: cadquery.types.UnitLiterals | None = None,
    exploded: bool = False,
    explode_spacing: float = 30.0,
    explode_nested: bool = False,
):
    inst = _instantiate(identifier, params)
    if inst is None:
        return None

    location = _resolve_location(identifier, location, "step")
    return exporters.export(
        _cad(inst, exploded, explode_spacing, explode_nested),
        location,
        exportType=exporters.ExportTypes.STEP,
        unit=unit,
        outputUnit=output_unit,
    )


@export.command("stl", help="Export to STL format")
def export_stl(
    identifier: str,
    location: str | None = None,
    params: str | None = None,
    tolerance: float = 0.1,
    angular_tolerance: float = 0.1,
    ascii: bool = False,
    exploded: bool = False,
    explode_spacing: float = 30.0,
    explode_nested: bool = False,
):
    inst = _instantiate(identifier, params)
    if inst is None:
        return None

    location = _resolve_location(identifier, location, "stl")
    return exporters.export(
        _cad(inst, exploded, explode_spacing, explode_nested),
        location,
        exportType=exporters.ExportTypes.STL,
        tolerance=tolerance,
        angularTolerance=angular_tolerance,
        opt={"ascii": ascii},
    )


@export.command(
    "other",
    help=(
        "Export to any other format cadquery supports "
        f"({', '.join(sorted(_EXTENSION_BY_TYPE))}) via generic passthrough"
    ),
)
def export_other(
    identifier: str,
    format: str,
    location: str | None = None,
    params: str | None = None,
    tolerance: float = 0.1,
    angular_tolerance: float = 0.1,
    exploded: bool = False,
    explode_spacing: float = 30.0,
    explode_nested: bool = False,
):
    format = format.upper()
    if format not in _EXTENSION_BY_TYPE:
        print(
            f"Unknown export format {format!r}. Supported: {', '.join(sorted(_EXTENSION_BY_TYPE))}"
        )
        return None

    inst = _instantiate(identifier, params)
    if inst is None:
        return None

    location = _resolve_location(identifier, location, _EXTENSION_BY_TYPE[format])
    return exporters.export(
        _cad(inst, exploded, explode_spacing, explode_nested),
        location,
        exportType=format,
        tolerance=tolerance,
        angularTolerance=angular_tolerance,
    )
