import math

from cad.lib.cycloidal import cycloidal_disc_profile


def test_profile_is_closed():
    points = cycloidal_disc_profile(
        num_ring_pins=10,
        ring_pin_radius=1.5,
        ring_pin_circle_radius=30,
        eccentricity=1.0,
        num_points=200,
    )
    first, last = points[0], points[-1]
    assert math.isclose(first[0], last[0], abs_tol=1e-6)
    assert math.isclose(first[1], last[1], abs_tol=1e-6)


def test_profile_point_count():
    points = cycloidal_disc_profile(
        num_ring_pins=10,
        ring_pin_radius=1.5,
        ring_pin_circle_radius=30,
        eccentricity=1.0,
        num_points=200,
    )
    assert len(points) == 201


def test_profile_bounding_radius_near_ring_pin_circle():
    ring_pin_radius = 1.5
    ring_pin_circle_radius = 30
    eccentricity = 1.0
    points = cycloidal_disc_profile(
        num_ring_pins=10,
        ring_pin_radius=ring_pin_radius,
        ring_pin_circle_radius=ring_pin_circle_radius,
        eccentricity=eccentricity,
        num_points=360,
    )
    distances = [math.hypot(x, y) for x, y in points]

    nominal_radius = ring_pin_circle_radius - ring_pin_radius
    margin = 3 * eccentricity
    assert all(
        nominal_radius - margin <= d <= nominal_radius + margin for d in distances
    )


def test_lobe_count_matches_ring_pins_minus_one():
    num_ring_pins = 10
    points = cycloidal_disc_profile(
        num_ring_pins=num_ring_pins,
        ring_pin_radius=1.5,
        ring_pin_circle_radius=30,
        eccentricity=1.0,
        num_points=720,
    )
    distances = [math.hypot(x, y) for x, y in points[:-1]]

    lobe_count = 0
    n = len(distances)
    for i in range(n):
        prev_d = distances[(i - 1) % n]
        curr = distances[i]
        next_d = distances[(i + 1) % n]
        if curr >= prev_d and curr >= next_d and curr > prev_d:
            lobe_count += 1

    assert lobe_count == num_ring_pins - 1
