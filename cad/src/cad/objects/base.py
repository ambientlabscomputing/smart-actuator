from abc import abstractmethod

import cadquery

from cad.lib.cadq.exportable import Exportable


class CADObject(Exportable):
    @abstractmethod
    def cad(self) -> cadquery.Workplane:
        """
        Returns the cadquery object with all parameters applied
        """
