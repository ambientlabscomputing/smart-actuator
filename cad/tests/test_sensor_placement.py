"""
Integration-level checks for the encoder sensor mount, spanning
CycloidalGearboxAssembly, ShellLid, and ShellAssembly together. These
build real solids and check real 3D intersections -- the two bugs this
guards against (the sensor board placed on the wrong side of its own
pocket, and a <Z-face workplane silently flipping rotation handedness)
were both invisible to formula-level checks and only showed up once the
actual assembled geometry was built and measured.
"""

import itertools
import json
import math
from pathlib import Path

from machinewright.assemblies.base import _walk_assembly
import pytest

from cad.assemblies.actuator import ActuatorAssembly
from cad.objects.shell.shell_lid import ShellLid

_MAKEFILE = Path(__file__).parent.parent / "Makefile"


def _actuator_params() -> dict:
    """The Makefile's own ACTUATOR_PARAMS default, parsed for real -- so
    this test tracks whatever the project actually ships, not a copy
    that can drift out of sync with it."""
    text = _MAKEFILE.read_text()
    for line in text.splitlines():
        if line.startswith("ACTUATOR_PARAMS"):
            return json.loads(line.split("?=", 1)[1].strip())
    raise AssertionError("ACTUATOR_PARAMS not found in Makefile")


def _real_solid_collisions(actuator: ActuatorAssembly) -> list[tuple[str, str, float]]:
    """
    Every leaf part in the real assembled tree, at its true composed
    world transform, checked against every other for actual 3D overlap.
    Bounding-box reject first, so this stays fast; a real
    `cadquery` boolean intersection decides anything the boxes don't
    rule out.
    """
    assy = actuator.assemble()
    parts = [(name, shape.located(loc)) for shape, _, loc, name in _walk_assembly(assy)]

    collisions = []
    for (n1, s1), (n2, s2) in itertools.combinations(parts, 2):
        bb1, bb2 = s1.BoundingBox(), s2.BoundingBox()
        if (
            bb1.xmax < bb2.xmin
            or bb2.xmax < bb1.xmin
            or bb1.ymax < bb2.ymin
            or bb2.ymax < bb1.ymin
            or bb1.zmax < bb2.zmin
            or bb2.zmax < bb1.zmin
        ):
            continue
        overlap = s1.intersect(s2)
        vol = overlap.Volume() if overlap.Volume() else 0
        if vol > 1e-6:
            collisions.append((n1, n2, vol))
    return collisions


def test_no_sensor_or_encoder_part_collides_with_anything():
    """
    The real regression test for both bugs found in review: the sensor
    board placed on the wrong side of its own pocket (landed fully
    inside the encoder magnet's pocket instead), and the pocket itself
    cut at the mirror-image angle of where the board was placed (a <Z
    workplane's rotation direction is flipped relative to a plain
    Workplane("XY")). Neither was visible to a formula -- both only
    showed up in the actual solid geometry.
    """
    actuator = ActuatorAssembly(**_actuator_params())
    collisions = _real_solid_collisions(actuator)
    sensor_collisions = [
        c for c in collisions if "sensor" in c[0] + c[1] or "encoder" in c[0] + c[1]
    ]
    assert sensor_collisions == []


def test_sensor_pocket_lands_at_the_requested_world_angle():
    """
    Pins the actual cut location, not just the parameter passed in --
    the previous bug had the right angle going in and the wrong angle
    coming out, because of a workplane handedness flip a formula-level
    check can't see. Verified here by actually removing the pocket
    material and finding its real centroid, the same way the bug was
    originally diagnosed.
    """
    requested_angle = 30.0
    requested_radius = 28.9
    common = dict(
        outer_diameter=91.22,
        thickness=4,
        bolt_circle_diameter=79.22,
        num_bolts=8,
        bolt_hole_diameter=3.4,
        output_clearance_diameter=46.0,
        sensor_mount_radius=requested_radius,
        sensor_mount_angle=requested_angle,
        sensor_hole_inset=1.0,
        sensor_thread_size="M3",
    )
    with_pocket = ShellLid(**common, sensor_board_width=5, sensor_board_length=10).cad().val()
    no_pocket = ShellLid(
        **common, sensor_board_width=0.001, sensor_board_length=0.001
    ).cad().val()

    removed = no_pocket.cut(with_pocket)
    bb = removed.BoundingBox()
    cx, cy = (bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2

    actual_angle = math.degrees(math.atan2(cy, cx))
    actual_radius = math.hypot(cx, cy)

    assert actual_angle == pytest.approx(requested_angle, abs=0.5)
    assert actual_radius == pytest.approx(requested_radius, abs=0.5)


def test_sensor_pocket_is_cut_into_the_lid_not_toward_the_flange():
    """
    The pocket must open toward the flange (so the sensor can see the
    magnet) but its material removal has to happen going INTO the lid's
    own thickness, not toward the flange's side of the assembly gap --
    that direction is where the encoder magnet's own pocket lives, on
    the other part.
    """
    lid = ShellLid(
        outer_diameter=91.22,
        thickness=4,
        bolt_circle_diameter=79.22,
        num_bolts=8,
        bolt_hole_diameter=3.4,
        output_clearance_diameter=46.0,
        sensor_mount_radius=28.9,
        sensor_mount_angle=30.0,
        sensor_board_width=5,
        sensor_board_length=10,
        sensor_hole_inset=1.0,
        sensor_thread_size="M3",
    )
    no_pocket = ShellLid(
        **{**vars(lid), "sensor_board_width": 0.001, "sensor_board_length": 0.001}
    )
    removed = no_pocket.cad().val().cut(lid.cad().val())
    bb = removed.BoundingBox()

    # the lid's own solid spans local z in [0, thickness]; the pocket
    # must fall entirely within that span, not below z=0
    assert bb.zmin >= -1e-6
    assert bb.zmax <= lid.thickness + 1e-6
