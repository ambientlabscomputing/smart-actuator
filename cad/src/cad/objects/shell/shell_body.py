import math

import cadquery

from cad.lib.fasteners import HEAT_SET_INSERT_SPECS, ScrewSize
from cad.objects.base import CADObject

# The pod's inner face has to genuinely plunge past the tube's outer
# radius, not just sit exactly coincident with it -- a boolean union of
# two solids that only touch at a coincident/tangent face is numerically
# fragile and often produces two separate touching solids instead of one
# fused body (confirmed: this was happening before the overlap was added).
_POD_OVERLAP = 1.5


class ShellBody(CADObject):
    """
    Cylindrical tube wrapping the gearbox stack's outer diameter. Its <Z
    end bolts to the ring housing's shell bolt circle -- the heat-set
    insert lives here (not in the housing, which keeps its plain
    clearance holes), same "insert in whichever part actually clamps"
    split already used for ring pins vs. roller pins.

    A rectangular pod duct bulges out of the tube wall at a fixed
    angular position (+X, angle=0): a window cut through the tube wall,
    a thin-walled box duct connecting it outward, and a bolt circle in
    the duct's outward-facing frame for an electronics `BoardMount` to
    bolt onto from outside -- that plate doubles as the pod's cover.
    """

    def __init__(
        self,
        outer_diameter: float,
        wall_thickness: float,
        length: float,
        thread_size: ScrewSize,
        bolt_circle_diameter: float,
        num_bolts: int,
        pod_width: float,
        pod_height: float,
        pod_depth: float,
        pod_center_z: float,
        pod_bolt_circle_diameter: float,
        num_pod_bolts: int,
    ):
        self.outer_diameter = outer_diameter
        self.wall_thickness = wall_thickness
        self.length = length
        self.thread_size = thread_size
        self.bolt_circle_diameter = bolt_circle_diameter
        self.num_bolts = num_bolts
        self.pod_width = pod_width
        self.pod_height = pod_height
        self.pod_depth = pod_depth
        self.pod_center_z = pod_center_z
        self.pod_bolt_circle_diameter = pod_bolt_circle_diameter
        self.num_pod_bolts = num_pod_bolts

    @property
    def inner_diameter(self) -> float:
        return self.outer_diameter - 2 * self.wall_thickness

    @property
    def pod_radial_end(self) -> float:
        return self.outer_diameter / 2 + self.pod_depth

    @property
    def pod_center(self) -> tuple[float, float, float]:
        """
        Center of the pod's outward-facing frame, in this object's own
        local frame -- where a BoardMount should be placed to cover it.
        """
        return (self.pod_radial_end, 0.0, self.pod_center_z)

    def cad(self) -> cadquery.Workplane:
        tube = (
            cadquery.Workplane("XY")
            .circle(self.outer_diameter / 2)
            .circle(self.inner_diameter / 2)
            .extrude(self.length)
        )

        # base flange insert bores, cut from the <Z (ring-housing-facing)
        # end -- the bolt passes through the housing's plain clearance
        # hole and threads in here
        insert_spec = HEAT_SET_INSERT_SPECS[self.thread_size]
        bolt_radius = self.bolt_circle_diameter / 2
        bolt_points = [
            (
                bolt_radius * math.cos(2 * math.pi * i / self.num_bolts),
                bolt_radius * math.sin(2 * math.pi * i / self.num_bolts),
            )
            for i in range(self.num_bolts)
        ]
        tube = (
            tube.faces("<Z")
            .workplane()
            .pushPoints(bolt_points)
            .hole(insert_spec.bore_diameter, depth=insert_spec.length)
        )

        # same insert pattern at the >Z (lid-facing) end -- the lid also
        # just gets plain clearance holes and threads into the tube
        tube = (
            tube.faces(">Z")
            .workplane()
            .pushPoints(bolt_points)
            .hole(insert_spec.bore_diameter, depth=insert_spec.length)
        )

        # window through the tube wall where the pod connects
        window_cutter = cadquery.Workplane(
            "XY", origin=(self.outer_diameter / 2, 0, self.pod_center_z)
        ).box(self.wall_thickness * 4, self.pod_width, self.pod_height)
        tube = tube.cut(window_cutter)

        # pod duct: thin-walled box frame running from _inside_ the tube
        # wall (by _POD_OVERLAP, for a real fuse) out to pod_radial_end,
        # open through its full depth (a picture-frame duct) so the
        # cavity connects the tube interior to the outward opening a
        # BoardMount bolts over. Both the outer frame and the cavity
        # extend into the overlap zone together -- in that zone the
        # frame ring (outside the window's footprint) genuinely shares
        # volume with the tube's own remaining wall material there,
        # which is what a boolean union actually needs to fuse into one
        # solid instead of two separate touching ones.
        pod_inner_x = self.outer_diameter / 2 - _POD_OVERLAP
        pod_span = self.pod_radial_end - pod_inner_x
        pod_mid_x = (pod_inner_x + self.pod_radial_end) / 2
        pod_outer = cadquery.Workplane(
            "XY", origin=(pod_mid_x, 0, self.pod_center_z)
        ).box(
            pod_span,
            self.pod_width + 2 * self.wall_thickness,
            self.pod_height + 2 * self.wall_thickness,
        )
        # +0.2 epsilon on top of the shared span avoids coincident-face
        # numerical issues at the outward tip
        pod_cavity = cadquery.Workplane(
            "XY", origin=(pod_mid_x, 0, self.pod_center_z)
        ).box(pod_span + 0.2, self.pod_width, self.pod_height)
        pod = pod_outer.cut(pod_cavity)

        tube = tube.union(pod)

        # pod bolt circle: insert bores in the outward-facing frame
        # material, cut blind from the tip inward -- the electronics
        # BoardMount that bolts on here gets plain clearance holes, same
        # "insert in the structural part" split as everywhere else.
        # Positioned symmetric around a point set back by half the
        # insert length so the blind cut lands correctly regardless of
        # this workplane's normal sign.
        pod_bolt_radius = self.pod_bolt_circle_diameter / 2
        pod_bolt_points = [
            (
                pod_bolt_radius * math.cos(2 * math.pi * i / self.num_pod_bolts),
                pod_bolt_radius * math.sin(2 * math.pi * i / self.num_pod_bolts),
            )
            for i in range(self.num_pod_bolts)
        ]
        pod_bolt_cutters = (
            cadquery.Workplane(
                "YZ",
                origin=(
                    self.pod_radial_end - insert_spec.length / 2,
                    0,
                    self.pod_center_z,
                ),
            )
            .pushPoints(pod_bolt_points)
            .circle(insert_spec.bore_diameter / 2)
            .extrude(insert_spec.length / 2, both=True)
        )
        tube = tube.cut(pod_bolt_cutters)

        return tube
