"""
Cross-part geometry invariants for the gearbox assembly.

These guard the properties that `_derive()` has to keep true for the
gearbox to be a working gear rather than merely a set of parts that
each build without error. A regression here doesn't raise -- it quietly
exports a broken STEP file -- so it gets asserted instead.
"""

import math

import pytest

from cad.assemblies.cycloidal_gearbox import (
    _DISC_TO_FLANGE_CLEARANCE,
    CycloidalGearboxAssembly,
)
from cad.lib.cycloidal import cycloidal_disc_profile

# the Makefile's own GEARBOX_PARAMS defaults
DEFAULT_PARAMS = dict(
    nema_size="17",
    num_ring_pins=10,
    ring_pin_diameter=4,
    eccentricity=1.0,
    disc_thickness=6,
    num_output_rollers=6,
    roller_pin_diameter=5,
    output_interface_diameter=14,
    ring_pin_thread_size="M3",
    roller_pin_thread_size="M3",
    num_shell_bolts=8,
    num_interface_bolts=4,
    interface_thread_size="M3",
    num_adapter_bolts=4,
    adapter_thread_size="M3",
    bearing_inner_diameter=10,
    bearing_outer_diameter=22,
)


def gearbox(**overrides) -> CycloidalGearboxAssembly:
    return CycloidalGearboxAssembly(**{**DEFAULT_PARAMS, **overrides})


def disc_min_boundary_radius(gb: CycloidalGearboxAssembly) -> float:
    """Smallest radius of the cycloidal disc's own lobed outer profile."""
    d = gb._derive()
    profile = cycloidal_disc_profile(
        num_ring_pins=gb.num_ring_pins,
        ring_pin_radius=gb.ring_pin_diameter / 2,
        ring_pin_circle_radius=d.ring_pin_circle_diameter / 2,
        eccentricity=gb.eccentricity,
        num_points=720,
    )
    return min(math.hypot(x, y) for x, y in profile)


@pytest.mark.parametrize("output_interface_diameter", [8, 10, 12, 14])
def test_disc_output_holes_stay_inside_disc_rim(output_interface_diameter):
    """
    The disc's output holes ride on the same circle as the flange's
    roller pins. If anything pushes that circle outward far enough, the
    holes break through the disc's lobed rim and destroy the gear --
    which is exactly what happened when the encoder ring was (wrongly)
    allowed to drive this value.
    """
    gb = gearbox(output_interface_diameter=output_interface_diameter)
    d = gb._derive()

    hole_outer_edge = d.output_hole_circle_diameter / 2 + d.output_hole_diameter / 2

    # the disc's own profile, less the eccentric offset it orbits through
    available = disc_min_boundary_radius(gb) - gb.eccentricity

    assert hole_outer_edge < available, (
        f"output holes reach r={hole_outer_edge:.2f} but the disc's rim only "
        f"allows r={available:.2f} -- the output hole circle is too far out"
    )


def test_derive_closed_form_disc_rim_matches_the_real_profile():
    """
    `_derive()`'s guard uses a closed form for the disc's minimum
    boundary radius instead of generating the profile. Pin that they
    actually agree, so the guard can't drift away from the real geometry.
    """
    gb = gearbox()
    d = gb._derive()
    closed_form = (
        d.ring_pin_circle_diameter / 2 - gb.ring_pin_diameter / 2 - gb.eccentricity
    )
    assert closed_form == pytest.approx(disc_min_boundary_radius(gb), abs=1e-6)


def test_oversized_output_interface_is_rejected_loudly():
    """
    A pre-existing trap, found while fixing the encoder regression: a
    large enough `output_interface_diameter` pushes the output holes
    through the disc's rim. It used to export a broken STEP file without
    complaint; now it raises.
    """
    with pytest.raises(ValueError, match="break through its own profile"):
        gearbox(output_interface_diameter=18)._derive()


def test_encoder_ring_does_not_move_the_roller_circle():
    """
    The encoder ring is a pocket engraved into existing material. It may
    grow the flange's outer rim, but it must never feed back into
    `output_hole_circle_diameter` (which is also the disc's own output
    hole circle). Pinned to the known-good value for the defaults.
    """
    assert gearbox()._derive().output_hole_circle_diameter == pytest.approx(43.9)


def test_encoder_ring_clears_the_roller_pin_bolt_heads():
    gb = gearbox()
    d = gb._derive()
    roller_counterbore_radius = 5.5 / 2 + 0.4 / 2  # M3 head + OutputFlange's clearance
    roller_head_outer = d.output_hole_circle_diameter / 2 + roller_counterbore_radius

    assert d.sensor_ring_inner_diameter / 2 > roller_head_outer


def test_sensor_mount_radius_lies_within_the_ring():
    gb = gearbox()
    d = gb._derive()
    assert (
        d.sensor_ring_inner_diameter / 2
        < gb.sensor_mount_radius
        < d.sensor_ring_outer_diameter / 2
    )


def test_output_rotates_purely_about_the_center_axis():
    """
    The output flange must spin true about the true axis, not wobble with
    the disc's orbit -- the encoder reads a ring on that flange, and
    wobble would show up directly as angle error (2e/r, several degrees
    at our radii).

    The disc's orientation is NOT free: meshing locks it to
    -input_angle/lobes, and the flange turns with it. What absorbs the
    orbit is the output holes being `2 * eccentricity` larger than the
    pins. Simulated over a full revolution: each hole must track its pin
    at a *constant* offset of exactly `eccentricity`. Constant is the
    whole point -- a varying offset would be transmitted wobble.
    """
    gb = gearbox()
    d = gb._derive()
    lobes = gb.num_ring_pins - 1
    e = gb.eccentricity
    hole_radius = d.output_hole_circle_diameter / 2
    slack = (d.output_hole_diameter - gb.roller_pin_diameter) / 2

    for step in range(0, 360, 3):
        theta = math.radians(step)
        disc_angle = -theta / lobes  # locked by the mesh
        flange_angle = disc_angle  # the flange turns with the disc
        cx, cy = e * math.cos(theta), e * math.sin(theta)

        for i in range(gb.num_output_rollers):
            a = 2 * math.pi * i / gb.num_output_rollers
            hole = (
                cx + hole_radius * math.cos(a + disc_angle),
                cy + hole_radius * math.sin(a + disc_angle),
            )
            pin = (
                hole_radius * math.cos(a + flange_angle),
                hole_radius * math.sin(a + flange_angle),
            )
            offset = math.hypot(hole[0] - pin[0], hole[1] - pin[1])

            assert offset == pytest.approx(e, abs=1e-9)
            assert offset <= slack + 1e-9


def test_input_shaft_does_not_reach_into_the_output_flange():
    """
    The shaft spins at input speed and the flange at output speed, so any
    shared volume between them is a collision, not a fit. (This used to
    overlap by 4mm.)
    """
    gb = gearbox()
    d = gb._derive()
    output_flange_z = (
        d.housing_thickness + gb.disc_thickness + _DISC_TO_FLANGE_CLEARANCE
    )
    assert d.shaft_length < output_flange_z
