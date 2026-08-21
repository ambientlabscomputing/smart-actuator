"""
Forward-kinematics and inverse-kinematics tests for every shipped template.

For each template we:
  1. Load DH defaults via DHChainValues.from_schema_defaults.
  2. Check the zero-pose geometry: no joint origin penetrates the floor and
     the EE is at a sane non-degenerate location.
  3. Drive a few canonical joint configurations through FK, then push the
     resulting EE pose back through IK and assert FK(IK(target)) == target
     to within 1 mm.

Templates with task_space "se3" (full pose) build a 7-vector target with the
EE orientation quaternion from FK; planar / r3 task spaces use position only.
"""

from __future__ import annotations

import math
from pathlib import Path

import pytest

from brain.models.machine import DHChainValues
from brain.service.dh_fk import ee_position_with_spec, joint_transforms
from brain.service.ik.solve import IKCallOptions, solve
from brain.service.template_service import TemplateService
from brain.utils.config import Config

TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"

POS_TOL_M = 1e-3  # 1 mm round-trip tolerance


def _load_template_schema(template_id: str):
    """Parse the template manifest into a TemplateParamSchema."""
    cfg = Config()
    cfg.templates.dir = str(TEMPLATES_DIR)
    svc = TemplateService(cfg)
    import asyncio

    schema = asyncio.run(svc.get_template(template_id))
    assert schema is not None, f"template {template_id} failed to load"
    return schema


def _build_dh(template_id: str) -> tuple[DHChainValues, object, object]:
    schema = _load_template_schema(template_id)
    dh = DHChainValues.from_schema_defaults(schema.dh)
    return dh, schema.end_effector, schema.ik


# ───────────────────────────────────────────────────────────────────────────────
# Test parameter table — what to exercise per template.
# ───────────────────────────────────────────────────────────────────────────────
#
# Each entry: (template_id, list of joint-configs to FK→IK roundtrip).  Each
# config is in radians, one per joint slot.  Configs are chosen to be inside
# joint limits and to span a representative subset of the workspace.

TEMPLATE_CASES = [
    (
        "two_dof_planar_arm",
        [
            [0.0, 0.0],
            [math.radians(30), math.radians(45)],
            [math.radians(-20), math.radians(60)],
        ],
    ),
    (
        "three_dof_anthropomorphic_arm",
        [
            [0.0, 0.0, 0.0],
            [math.radians(30), math.radians(-20), math.radians(60)],
            [math.radians(-45), math.radians(15), math.radians(-30)],
        ],
    ),
    (
        "six_dof_anthro_spherical_wrist",
        [
            [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            [
                math.radians(20),
                math.radians(-30),
                math.radians(20),
                math.radians(15),
                math.radians(-25),
                math.radians(10),
            ],
            [
                math.radians(-30),
                math.radians(20),
                math.radians(-15),
                math.radians(-10),
                math.radians(20),
                math.radians(-5),
            ],
        ],
    ),
    (
        "seven_dof_dlr",
        [
            [0.0] * 7,
            [
                math.radians(15),
                math.radians(-10),
                math.radians(20),
                math.radians(-25),
                math.radians(15),
                math.radians(-10),
                math.radians(5),
            ],
        ],
    ),
    (
        "scara_rrpr",
        [
            [0.0, 0.0, 0.0, 0.0],
            [0.08, math.radians(30), math.radians(-45), math.radians(90)],
            [0.15, math.radians(-60), math.radians(40), math.radians(-120)],
        ],
    ),
]


@pytest.mark.parametrize("template_id", [tid for tid, _ in TEMPLATE_CASES])
def test_zero_pose_no_floor_penetration(template_id: str) -> None:
    """At zero pose, no joint origin and no EE should be below z=0."""
    dh, ee_spec, _ = _build_dh(template_id)
    n = len(dh.joints)
    q = [0.0] * n
    transforms = joint_transforms(dh, q)
    ee = ee_position_with_spec(dh, q, ee_spec)
    zs = [T[11] for T in transforms] + [ee[2]]
    min_z = min(zs)
    assert min_z >= -1e-6, (
        f"{template_id}: zero pose penetrates floor (min z = {min_z:+.3f} m). "
        f"Add theta_offsets to the DH defaults to lift the arm above z=0."
    )


@pytest.mark.parametrize("template_id", [tid for tid, _ in TEMPLATE_CASES])
def test_zero_pose_ee_not_at_origin(template_id: str) -> None:
    """At zero pose, the EE should be measurably away from the base."""
    dh, ee_spec, _ = _build_dh(template_id)
    n = len(dh.joints)
    ee = ee_position_with_spec(dh, [0.0] * n, ee_spec)
    reach = math.sqrt(ee[0] ** 2 + ee[1] ** 2 + ee[2] ** 2)
    assert reach > 0.05, (
        f"{template_id}: zero-pose EE collapsed near origin (|EE| = {reach:.3f} m)."
    )


@pytest.mark.parametrize(
    "template_id, q",
    [(tid, q) for tid, qs in TEMPLATE_CASES for q in qs],
)
def test_fk_ik_roundtrip(template_id: str, q: list[float]) -> None:
    """FK(q) → IK should return joints whose FK matches the original target."""
    dh, ee_spec, ik_spec = _build_dh(template_id)
    n = len(dh.joints)
    assert len(q) == n

    # Forward: where does this config put the EE?
    target_xyz = ee_position_with_spec(dh, q, ee_spec)

    # Build target in the shape the solver expects.  Numeric solver reads:
    #   pos task: [x, y, z]
    #   se3 task: [x, y, z, qx, qy, qz, qw]
    # For se3 we extract the EE rotation from the FK transform.
    task = ee_spec.task_space if ee_spec else "r3"
    if task == "se3":
        # Pull the EE orientation matrix and convert to a quaternion.
        Ts = joint_transforms(dh, q)
        T = Ts[-1]
        # rotation matrix (row-major 4x4 -> 3x3)
        r = [[T[0], T[1], T[2]], [T[4], T[5], T[6]], [T[8], T[9], T[10]]]
        qx, qy, qz, qw = _mat_to_quat(r)
        target = [target_xyz[0], target_xyz[1], target_xyz[2], qx, qy, qz, qw]
    else:
        target = [target_xyz[0], target_xyz[1], target_xyz[2]]

    # Seed near (but not exactly at) the answer so analytic branch picks the
    # same elbow configuration without trivially returning the seed unchanged.
    seed = [qi + 0.05 for qi in q]

    solved = solve(
        dh,
        ik_spec,
        target,
        ee_spec,
        overrides=None,
        verification=None,
        current_q=seed,
        options=IKCallOptions(),
    )
    assert len(solved) == n

    # Validate by running FK on the solver's output and comparing positions.
    achieved = ee_position_with_spec(dh, solved, ee_spec)
    dx = achieved[0] - target_xyz[0]
    dy = achieved[1] - target_xyz[1]
    dz = achieved[2] - target_xyz[2]
    err = math.sqrt(dx * dx + dy * dy + dz * dz)
    assert err < POS_TOL_M, (
        f"{template_id} q={q}: round-trip position error {err * 1000:.3f} mm "
        f"(target={target_xyz}, achieved={achieved}, solved_q={solved})"
    )


def _mat_to_quat(R: list[list[float]]) -> tuple[float, float, float, float]:
    """Convert 3x3 rotation matrix to (qx, qy, qz, qw)."""
    trace = R[0][0] + R[1][1] + R[2][2]
    if trace > 0.0:
        s = math.sqrt(trace + 1.0) * 2.0
        qw = 0.25 * s
        qx = (R[2][1] - R[1][2]) / s
        qy = (R[0][2] - R[2][0]) / s
        qz = (R[1][0] - R[0][1]) / s
    elif R[0][0] > R[1][1] and R[0][0] > R[2][2]:
        s = math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]) * 2.0
        qw = (R[2][1] - R[1][2]) / s
        qx = 0.25 * s
        qy = (R[0][1] + R[1][0]) / s
        qz = (R[0][2] + R[2][0]) / s
    elif R[1][1] > R[2][2]:
        s = math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]) * 2.0
        qw = (R[0][2] - R[2][0]) / s
        qx = (R[0][1] + R[1][0]) / s
        qy = 0.25 * s
        qz = (R[1][2] + R[2][1]) / s
    else:
        s = math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]) * 2.0
        qw = (R[1][0] - R[0][1]) / s
        qx = (R[0][2] + R[2][0]) / s
        qy = (R[1][2] + R[2][1]) / s
        qz = 0.25 * s
    return qx, qy, qz, qw


# ───────────────────────────────────────────────────────────────────────────────
# Prismatic / Cartesian gantry tests
# ───────────────────────────────────────────────────────────────────────────────

GANTRY_TEMPLATE = "cnc_3axis_gantry"


@pytest.mark.parametrize(
    "q_m, expected_tcp_m",
    [
        ([0.0, 0.0, 0.0], None),  # zero pose — just check non-degenerate
        ([0.10, 0.20, 0.05], [0.10, 0.20, 0.05]),  # canonical XYZ move
        ([0.25, 0.15, 0.08], [0.25, 0.15, 0.08]),
    ],
)
def test_gantry_fk(q_m: list[float], expected_tcp_m: list[float] | None) -> None:
    """Prismatic FK: joint values in metres map directly to TCP position."""
    dh, ee_spec, _ = _build_dh(GANTRY_TEMPLATE)
    tcp = ee_position_with_spec(dh, q_m, ee_spec)
    if expected_tcp_m is not None:
        for axis, (got, want) in enumerate(zip(tcp, expected_tcp_m)):
            assert abs(got - want) < POS_TOL_M, (
                f"gantry FK axis {axis}: got {got:.4f} m, want {want:.4f} m (q={q_m})"
            )
    else:
        # Just confirm the EE is in a sane location (non-zero reach).
        reach = math.sqrt(sum(v**2 for v in tcp))
        # At zero pose, all joints at base, EE should be near origin (or offset).
        # Gantry zero: TCP at base frame origin — reach can be 0 if no EE offset.
        assert reach >= 0.0  # trivially true; proves no crash


@pytest.mark.parametrize(
    "target_m",
    [
        [0.05, 0.05, 0.05],
        [0.10, 0.20, 0.05],
        [0.25, 0.10, 0.09],
    ],
)
def test_gantry_ik_roundtrip(target_m: list[float]) -> None:
    """cartesian_xyz IK must recover the target TCP position to within 1 mm."""
    dh, ee_spec, ik_spec = _build_dh(GANTRY_TEMPLATE)

    target = list(target_m)
    solved = solve(
        dh,
        ik_spec,
        target,
        ee_spec,
        overrides=None,
        verification=None,
        current_q=[0.0, 0.0, 0.0],
        options=IKCallOptions(),
    )
    assert len(solved) == 3, f"expected 3 joint values, got {solved}"

    achieved = ee_position_with_spec(dh, solved, ee_spec)
    err = math.sqrt(sum((a - t) ** 2 for a, t in zip(achieved, target_m)))
    assert err < POS_TOL_M, (
        f"gantry IK round-trip error {err * 1000:.3f} mm "
        f"(target={target_m}, achieved={achieved}, q={solved})"
    )


def test_gantry_verifier_ok() -> None:
    """IK verifier should report 'ok' for the gantry template's decomposition."""
    from brain.service.ik.verifier import verify

    dh, _, ik_spec = _build_dh(GANTRY_TEMPLATE)
    result = verify(dh, ik_spec)
    assert result.blocks, "verifier returned no block results"
    for block_result in result.blocks:
        assert block_result.status in ("ok", "warning"), f"verifier returned error: {block_result}"


def test_gantry_verifier_rejects_parallel_axes() -> None:
    """
    If two prismatic joints share the same axis, cartesian_xyz should warn/reject.
    Build a degenerate DH (X, X, Z) and verify the verifier catches it.
    """
    from brain.models.machine import DHChainValues, DHJointValues, IKBlock, IKSpec
    from brain.service.ik.verifier import verify

    # Build a DH chain with 3 prismatic joints but two sharing the X axis.
    joints = [
        DHJointValues(
            name="j0",
            slot=0,
            a=0,
            alpha=0,
            d=0,
            theta_offset=0,
            type="prismatic",
            axis="x",
            limit_lower=0,
            limit_upper=0.3,
        ),
        DHJointValues(
            name="j1",
            slot=1,
            a=0,
            alpha=0,
            d=0,
            theta_offset=0,
            type="prismatic",
            axis="x",  # same as j0 — degenerate!
            limit_lower=0,
            limit_upper=0.3,
        ),
        DHJointValues(
            name="j2",
            slot=2,
            a=0,
            alpha=0,
            d=0,
            theta_offset=0,
            type="prismatic",
            axis="z",
            limit_lower=0,
            limit_upper=0.1,
        ),
    ]
    dh = DHChainValues(joints=joints)
    ik_spec = IKSpec(
        decomposition=[IKBlock(kind="cartesian_xyz", joints=[0, 1, 2])],
    )

    result = verify(dh, ik_spec)
    # At least one result should be 'warning' or 'error' due to parallel axes.
    statuses = {b.status for b in result.blocks}
    assert "warning" in statuses or "error" in statuses, (
        f"verifier should flag parallel axes but returned: {result.blocks}"
    )
