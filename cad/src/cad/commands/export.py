from datetime import UTC, datetime
import os
import tempfile

import typer

from cad.commands.ui import print
from cad.lib.cadq import exports
from cad.registry import registry
import json

export = typer.Typer()


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
):
    type_, name = identifier.split(".", 1)
    reg = registry()
    obj = None
    for cls_name, data in reg[type_].items():
        if cls_name.lower() == name.lower():
            obj = data["class"]
            break
    if not obj:
        print(f"{identifier} not found in registry")
        return
    params_: dict = {}
    if params is None:
        params_ = {}
    else:
        params_ = json.loads(params)
    inst = obj(**params_)
    if not location:
        temp_dir = tempfile.mkdtemp()
        location = os.path.join(temp_dir, f"{identifier}-{datetime.now(UTC).isoformat()}.svg")
        print(f"No location given, exporting to {location}")
    return inst.svg(
        location,
        exports.SVGOpts(
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
    )
