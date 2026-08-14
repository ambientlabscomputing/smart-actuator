import cadquery
from cadquery import Location, Vector
from machinewright import CADAssembly, attach, register_assembly
from machinewright.lib.fasteners import ScrewSize

from cad.objects.electronics.board_mount import BoardMount


@register_assembly
class ElectronicsAssembly(CADAssembly):
    """
    MVP electronics group: a single board mount. Multiple distinct
    boards are a natural follow-up -- instantiate more `BoardMount`s
    directly, it's already a registered, reusable CADObject, no new
    assembly-level plumbing needed for that.
    """

    def __init__(
        self,
        board_width: float,
        board_length: float,
        hole_inset: float,
        standoff_height: float,
        plate_thickness: float,
        thread_size: ScrewSize,
        num_mount_bolts: int,
        mount_bolt_circle_diameter: float,
        mount_bolt_diameter: float,
    ):
        self.board_width = board_width
        self.board_length = board_length
        self.hole_inset = hole_inset
        self.standoff_height = standoff_height
        self.plate_thickness = plate_thickness
        self.thread_size = thread_size
        self.num_mount_bolts = num_mount_bolts
        self.mount_bolt_circle_diameter = mount_bolt_circle_diameter
        self.mount_bolt_diameter = mount_bolt_diameter

    def _board_mount(self) -> BoardMount:
        return BoardMount(
            board_width=self.board_width,
            board_length=self.board_length,
            hole_inset=self.hole_inset,
            standoff_height=self.standoff_height,
            plate_thickness=self.plate_thickness,
            thread_size=self.thread_size,
            num_mount_bolts=self.num_mount_bolts,
            mount_bolt_circle_diameter=self.mount_bolt_circle_diameter,
            mount_bolt_diameter=self.mount_bolt_diameter,
        )

    def assemble(self) -> cadquery.Assembly:
        assembly = cadquery.Assembly()
        attach(
            assembly,
            self._board_mount(),
            loc=Location(Vector(0, 0, 0)),
            name="board_mount",
        )
        return assembly
