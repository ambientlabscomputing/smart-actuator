import cadquery

from cad.lib.fasteners import SHOULDER_BOLT_SPECS, ScrewSize
from cad.objects.base import CADObject


class ShoulderBolt(CADObject):
    """
    Simplified stand-in shape for an off-the-shelf shoulder bolt -- used
    for assembly clearance checks and visualization, not as a
    manufacturable part.

    Built along local +Z, head-first: hex socket head at z=0 (the
    accessible end, where a hex key reaches it), then a short thread
    engaging a heat-set insert right behind the head, then the long
    smooth shoulder -- the actual friction/contact surface -- running
    out to a bare tip. This is the opposite order from a classic
    catalog shoulder screw (thread at the tip): here the shoulder has
    to project all the way through the mounting plate and out the far
    side to reach the part it supports, with the fastening happening
    right behind the head instead.
    """

    def __init__(
        self,
        thread_size: ScrewSize,
        shoulder_diameter: float,
        shoulder_length: float,
        thread_length: float,
    ):
        self.thread_size = thread_size
        self.shoulder_diameter = shoulder_diameter
        self.shoulder_length = shoulder_length
        self.thread_length = thread_length

    def cad(self) -> cadquery.Workplane:
        spec = SHOULDER_BOLT_SPECS[self.thread_size]

        head = (
            cadquery.Workplane("XY")
            .circle(spec.head_diameter / 2)
            .extrude(spec.head_height)
        )
        head = (
            head.faces("<Z")
            .workplane()
            .polygon(6, spec.socket_diameter, circumscribed=True)
            .cutBlind(-spec.socket_depth)
        )

        thread = (
            cadquery.Workplane("XY", origin=(0, 0, spec.head_height))
            .circle(spec.thread_diameter / 2)
            .extrude(self.thread_length)
        )

        shoulder_z = spec.head_height + self.thread_length
        shoulder = (
            cadquery.Workplane("XY", origin=(0, 0, shoulder_z))
            .circle(self.shoulder_diameter / 2)
            .extrude(self.shoulder_length)
        )

        return head.union(thread).union(shoulder)
