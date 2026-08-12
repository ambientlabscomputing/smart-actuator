from abc import ABC, abstractmethod

import cadquery

from cad.lib.cadq import exports


class Exportable(ABC):
    @abstractmethod
    def cad(self) -> cadquery.Workplane:
        """
        Returns the cadquery object with all parameters applied
        """

    def svg(self, export_location: str, opts: exports.SVGOpts | None = None) -> None:
        exports.svg(
            cad=self.cad(),
            svg_opts=opts or exports.SVGOpts(),
            export_location=export_location,
        )
