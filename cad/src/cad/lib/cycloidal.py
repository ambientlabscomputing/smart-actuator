"""
Pure math for cycloidal disc tooth profiles. No cadquery dependency so
this can be unit tested independently of any CAD geometry kernel.
"""

import math


def cycloidal_disc_profile(
    num_ring_pins: int,
    ring_pin_radius: float,
    ring_pin_circle_radius: float,
    eccentricity: float,
    num_points: int = 200,
) -> list[tuple[float, float]]:
    """
    Returns a closed polygon (list of (x, y) points, first == last) tracing
    the cycloidal disc profile for a drive with `num_ring_pins` fixed ring
    pins. The resulting disc has `num_ring_pins - 1` lobes, which is also
    the reduction ratio of the drive.
    """
    n = num_ring_pins
    rz = ring_pin_radius
    rz_circle = ring_pin_circle_radius
    e = eccentricity

    points: list[tuple[float, float]] = []
    for i in range(num_points + 1):
        theta = i * 2 * math.pi / num_points
        psi = math.atan2(
            math.sin((1 - n) * theta),
            rz_circle / (e * n) - math.cos((1 - n) * theta),
        )
        x = (
            rz_circle * math.cos(theta)
            - rz * math.cos(theta + psi)
            - e * math.cos(n * theta)
        )
        y = (
            -rz_circle * math.sin(theta)
            + rz * math.sin(theta + psi)
            + e * math.sin(n * theta)
        )
        points.append((x, y))

    return points
