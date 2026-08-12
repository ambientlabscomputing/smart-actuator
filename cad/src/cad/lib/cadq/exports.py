import cadquery
from pydantic import BaseModel, Field


class SVGOpts(BaseModel):
    width: int = Field(default=300)
    height: int = Field(default=300)
    marginLeft: int = Field(default=10)  # noqa: N815 -- keeping underlying API convention
    marginTop: int = Field(default=10)  # noqa: N815 -- keeping underlying API convention
    showAxes: bool = Field(default=False)  # noqa: N815 -- keeping underlying API convention
    projectionDir: tuple[float, float, float] = Field(default=(-1.75, 1.1, 5))  # noqa: N815 -- keeping underlying API convention
    strokeWidth: float = Field(default=0.25)  # noqa: N815 -- keeping underlying API convention
    strokeColor: tuple[float, float, float] = Field(default=(0, 0, 0))  # noqa: N815 -- keeping underlying API convention
    hiddenColor: tuple[float, float, float] = Field(default=(0, 0, 255))  # noqa: N815 -- keeping underlying API convention
    showHidden: bool = Field(default=True)  # noqa: N815 -- keeping underlying API convention


def svg(cad: cadquery.Workplane, svg_opts: SVGOpts, export_location: str) -> None:
    """
    Exports the CAD object
    """
    cad.export(export_location, opt=svg_opts.model_dump())
