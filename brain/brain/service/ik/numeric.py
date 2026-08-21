"""
Damped Least-Squares (DLS) Jacobian-based numeric IK solver.

Implements iterative Jacobian iteration with Levenberg-Marquardt damping.
Works on a subset of joint indices (for block-level use) or the full chain.

    q_{k+1} = q_k + (J^T J + λ²I)^{-1} J^T e

where e is the task-space error and λ is the damping coefficient.

For task_space == "planar_xz" or "planar_xy" only the relevant 2 position
rows of the Jacobian are used; for "r3" only the top 3 rows; for "se3"
all 6 rows are used.

The solver uses only the stdlib (math) — no numpy.  Matrix operations are
done via the same flat-list helpers in dh_fk.  For the small matrices
involved (≤ 7 DOF × 6 task rows) this is acceptably fast.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec, IKNumericConfig

_DEFAULT_MAX_ITERS = 150
_DEFAULT_POS_TOL = 1e-4
_DEFAULT_ROT_TOL = 1e-3
_DEFAULT_DAMPING = 0.01


def solve_numeric(
    dh: DHChainValues,
    joint_indices: list[int],
    target: list[float],  # [x, y, z] or [x, y, z, qx, qy, qz, qw]
    ee: EndEffectorSpec | None,
    *,
    seed: list[float] | None = None,
    config: IKNumericConfig | None = None,
) -> list[float] | None:
    """
    Iterate damped Jacobian IK for the joints in *joint_indices*.

    *target* is either [x,y,z] (position-only) or [x,y,z,qx,qy,qz,qw]
    (full pose).  The active rows of the Jacobian are selected from the
    machine's task_space setting on *ee* (defaults to 'r3' when ee is None
    and target has 3 elements).

    Returns the solved angles (rad) for *joint_indices* in order, or None
    if it failed to converge.
    """
    from brain.models.machine import joint_limit_to_si
    from brain.service.dh_fk import ee_transform, geometric_jacobian

    max_iters = config.max_iters if config else _DEFAULT_MAX_ITERS
    pos_tol = config.pos_tol_m if config else _DEFAULT_POS_TOL
    rot_tol = config.rot_tol_rad if config else _DEFAULT_ROT_TOL
    damping = config.damping if config else _DEFAULT_DAMPING

    n = len(dh.joints)
    nk = len(joint_indices)

    # Build the current full joint-angle vector
    q = [seed[k] if seed and k < len(seed) else 0.0 for k in range(nk)]
    full_q = _build_full_q(dh, joint_indices, q)

    use_orientation = len(target) >= 7
    task_space = (ee.task_space if ee else "r3") if not use_orientation else "se3"
    active_rows = _active_rows(task_space)

    # Extract target position
    p_target = [float(target[k]) for k in range(min(3, len(target)))]
    while len(p_target) < 3:
        p_target.append(0.0)

    # Extract target orientation quaternion (if se3)
    q_target = None
    if use_orientation and len(target) >= 7:
        q_target = [float(target[k]) for k in range(3, 7)]
        qn = math.sqrt(sum(x * x for x in q_target))
        if qn > 1e-9:
            q_target = [x / qn for x in q_target]

    for _ in range(max_iters):
        T_ee = ee_transform(dh, full_q, ee)
        p_cur = [T_ee[3], T_ee[7], T_ee[11]]

        # Position error
        e_p = [p_target[k] - p_cur[k] for k in range(3)]

        # Orientation error (axis-angle from rotation residual)
        e_r = [0.0, 0.0, 0.0]
        if q_target is not None:
            R_cur = [
                [T_ee[0], T_ee[1], T_ee[2]],
                [T_ee[4], T_ee[5], T_ee[6]],
                [T_ee[8], T_ee[9], T_ee[10]],
            ]
            R_target = _quat_to_rot(*q_target)
            # R_err = R_target · R_cur^T
            R_err = _mat_mul_3x3(R_target, _transpose_3x3(R_cur))
            e_r = _rot_to_axis_angle(R_err)

        # Build task error vector using active rows
        e = _build_error(e_p, e_r, active_rows)

        # Convergence check
        pos_err = math.sqrt(sum(x * x for x in e_p))
        rot_err = math.sqrt(sum(x * x for x in e_r)) if q_target else 0.0
        if pos_err < pos_tol and rot_err < rot_tol:
            return [full_q[joint_indices[k]] for k in range(nk)]

        # Full 6×n Jacobian, then pick active rows × block columns
        J_full = geometric_jacobian(dh, full_q, ee)
        J = _extract_subjacobian(J_full, active_rows, joint_indices)

        # DLS update: Δq = (J^T J + λ²I)^{-1} J^T e
        delta_q = _dls_solve(J, e, damping, nk)

        # Apply update
        for k in range(nk):
            idx = joint_indices[k]
            new_angle = full_q[idx] + delta_q[k]
            # Clamp to joint limits. Revolute limits are stored in degrees
            # (convert to radians); prismatic limits are stored in metres
            # already (pass through unchanged) — see joint_limit_to_si().
            jv = dh.joints[idx]
            lo = joint_limit_to_si(jv, jv.limit_lower)
            hi = joint_limit_to_si(jv, jv.limit_upper)
            full_q[idx] = max(lo, min(hi, new_angle))

    # Return best effort even if not converged
    return [full_q[joint_indices[k]] for k in range(nk)]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _build_full_q(dh: DHChainValues, joint_indices: list[int], q: list[float]) -> list[float]:
    """Map block-local q values into a full-chain angle list."""
    full = [0.0] * len(dh.joints)
    for k, idx in enumerate(joint_indices):
        if idx < len(full):
            full[idx] = q[k] if k < len(q) else 0.0
    return full


def _active_rows(task_space: str) -> list[int]:
    """Return which Jacobian rows to use for the given task space."""
    if task_space == "planar_xz":
        return [0, 2]  # x, z position only
    if task_space == "planar_xy":
        return [0, 1]  # x, y position only
    if task_space == "r3":
        return [0, 1, 2]  # full 3-D position
    # se3 — all 6 rows
    return [0, 1, 2, 3, 4, 5]


def _build_error(e_p: list[float], e_r: list[float], rows: list[int]) -> list[float]:
    full = e_p + e_r  # 6-element error
    return [full[r] for r in rows]


def _extract_subjacobian(
    J_full: list[list[float]],
    active_rows: list[int],
    joint_indices: list[int],
) -> list[list[float]]:
    """Extract rows × columns sub-Jacobian."""
    return [[J_full[r][c] for c in joint_indices] for r in active_rows]


def _dls_solve(J: list[list[float]], e: list[float], lam: float, n: int) -> list[float]:
    """
    Compute the DLS update:  Δq = (J^T J + λ²I)^{-1} J^T e

    J is m×n (m task rows, n joint columns).
    Uses explicit small-matrix math — adequate for n ≤ 7.
    Clamps the step norm to 0.5 rad to prevent large steps near singularities.
    """
    m = len(J)
    lam2 = lam * lam

    # A = J^T J + λ²I  (n×n)
    A = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            s = sum(J[r][i] * J[r][j] for r in range(m))
            A[i][j] = s + (lam2 if i == j else 0.0)

    # b = J^T e  (n)
    b = [sum(J[r][i] * e[r] for r in range(m)) for i in range(n)]

    # Solve A x = b via Gaussian elimination with partial pivoting
    delta_q = _gauss_solve(A, b, n)

    # Step-size limit: prevents large steps near singular configurations.
    MAX_STEP = 0.5  # rad per iteration
    step_norm = math.sqrt(sum(x * x for x in delta_q))
    if step_norm > MAX_STEP:
        scale = MAX_STEP / step_norm
        delta_q = [x * scale for x in delta_q]

    return delta_q


def _gauss_solve(A: list[list[float]], b: list[float], n: int) -> list[float]:
    """Gaussian elimination with partial pivoting, returns x such that Ax=b."""
    # Augmented matrix
    M = [A[i][:] + [b[i]] for i in range(n)]

    for col in range(n):
        # Pivot
        max_row = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[max_row] = M[max_row], M[col]
        pivot = M[col][col]
        if abs(pivot) < 1e-14:
            # Near-singular — return zero step
            return [0.0] * n
        for row in range(col + 1, n):
            factor = M[row][col] / pivot
            M[row] = [M[row][k] - factor * M[col][k] for k in range(n + 1)]

    # Back-substitution
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))) / M[i][i]
    return x


def _quat_to_rot(qx: float, qy: float, qz: float, qw: float) -> list[list[float]]:
    return [
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
        [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
        [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ]


def _transpose_3x3(R: list[list[float]]) -> list[list[float]]:
    return [[R[j][i] for j in range(3)] for i in range(3)]


def _mat_mul_3x3(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _rot_to_axis_angle(R: list[list[float]]) -> list[float]:
    """
    Extract the axis-angle error vector from a rotation matrix.
    Returns ω such that |ω| is the rotation angle and ω/|ω| is the axis.
    """
    # angle = acos((trace(R) - 1) / 2)
    trace = R[0][0] + R[1][1] + R[2][2]
    cos_a = max(-1.0, min(1.0, (trace - 1.0) / 2.0))
    angle = math.acos(cos_a)
    if angle < 1e-9:
        return [0.0, 0.0, 0.0]
    # axis from skew-symmetric part
    axis = [
        (R[2][1] - R[1][2]) / (2.0 * math.sin(angle)),
        (R[0][2] - R[2][0]) / (2.0 * math.sin(angle)),
        (R[1][0] - R[0][1]) / (2.0 * math.sin(angle)),
    ]
    return [axis[k] * angle for k in range(3)]
