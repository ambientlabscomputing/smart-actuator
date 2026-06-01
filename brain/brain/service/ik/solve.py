"""
Top-level IK solve entry point.

Dispatch policy (in priority order):
  1. force_numeric override on machine    → numeric only
  2. ik_strategy="numeric" on the call   → numeric only
  3. ik_strategy="analytic" on the call  → analytic only (error if unavailable)
  4. ik_strategy="auto" (default)
       a. verified analytic decomposition → analytic, then numeric polish
       b. failed/missing decomposition    → numeric

After any analytic solve the residual is checked.  If it exceeds pos_tol the
numeric polish step is run for up to max_iters/3 extra iterations.

Raises IKUnreachable if the target is outside the workspace hull.
Raises IKNoSolution  if the solver fails to converge.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from brain.service.ik.errors import IKNoSolution, IKUnreachable

if TYPE_CHECKING:
    from brain.models.machine import (
        DHChainValues,
        EndEffectorSpec,
        IKSpec,
        IKNumericConfig,
        IKOverrides,
        IKVerification,
    )


@dataclass
class IKCallOptions:
    """Per-call IK options.  All fields are optional; omit to use machine defaults."""

    strategy: str = "auto"
    """auto | analytic | numeric"""

    branch_preference: str = ""
    """elbow_up | elbow_down | nearest  (empty → use template default)"""

    seed: list[float] = field(default_factory=list)
    """Explicit seed angles (rad).  Empty → use seed policy from config."""


def solve(
    dh: "DHChainValues",
    ik_spec: "IKSpec | None",
    target: list[float],
    ee: "EndEffectorSpec | None",
    overrides: "IKOverrides | None",
    verification: "IKVerification | None",
    *,
    current_q: list[float] | None = None,
    options: IKCallOptions | None = None,
) -> list[float]:
    """
    Compute joint angles (rad) that place the EE at *target*.

    *target* is [x, y, z] for position-only or [x, y, z, qx, qy, qz, qw]
    for a full pose (quaternion must be unit-length).

    *current_q* is the current joint-angle vector (used as the numeric seed
    and branch-selection reference).

    Returns a list of n joint angles in slot order.

    Raises:
        IKUnreachable — target is outside the reachable workspace hull
                        (only checked when a hull is passed; omit hull to skip).
        IKNoSolution  — solver could not converge.
    """
    from brain.service.ik.numeric import solve_numeric
    from brain.service.ik.composer import compose

    opts = options or IKCallOptions()
    n = len(dh.joints)
    seed = _build_seed(dh, current_q, opts.seed, overrides)

    # Determine effective strategy
    use_numeric = _should_use_numeric(opts.strategy, overrides, verification)

    numeric_cfg = _effective_numeric_config(ik_spec, overrides)

    if use_numeric:
        result = solve_numeric(
            dh,
            list(range(n)),
            target,
            ee,
            seed=seed,
            config=numeric_cfg,
        )
        if result is None:
            raise IKNoSolution("Numeric IK failed to converge.", residual_m=float("inf"))
        return result

    # --- Analytic path ---
    if ik_spec is None or not ik_spec.decomposition:
        # No decomposition: fall back to numeric silently
        return _numeric_fallback(dh, n, target, ee, seed, numeric_cfg)

    # Override branch preference per-call if provided
    effective_spec = ik_spec
    if opts.branch_preference:
        effective_spec = _apply_branch_override(ik_spec, opts.branch_preference)

    analytic_q = compose(dh, effective_spec, target, ee, seed)

    if analytic_q is None:
        if opts.strategy == "analytic":
            raise IKNoSolution("Analytic IK returned no solution — decomposition could not solve this pose.")
        return _numeric_fallback(dh, n, target, ee, seed, numeric_cfg)

    # Polish step: check residual
    residual = _position_residual(dh, analytic_q, target, ee)
    pos_tol = numeric_cfg.pos_tol_m if numeric_cfg else 1e-4
    if residual > pos_tol * 10:
        # Significant residual — full numeric polish starting from analytic result
        polished = solve_numeric(
            dh,
            list(range(n)),
            target,
            ee,
            seed=analytic_q,
            config=_polish_config(numeric_cfg),
        )
        if polished is not None:
            analytic_q = polished

    return analytic_q


# ── Helpers ───────────────────────────────────────────────────────────────────

def _should_use_numeric(
    strategy: str,
    overrides: "IKOverrides | None",
    verification: "IKVerification | None",
) -> bool:
    if overrides and overrides.force_numeric:
        return True
    if strategy == "numeric":
        return True
    if strategy == "analytic":
        return False
    # auto
    if verification and verification.strategy == "numeric":
        return True
    return False


def _build_seed(
    dh: "DHChainValues",
    current_q: list[float] | None,
    explicit_seed: list[float],
    overrides: "IKOverrides | None",
) -> list[float]:
    n = len(dh.joints)
    if explicit_seed:
        s = list(explicit_seed)
        return (s + [0.0] * n)[:n]
    if current_q:
        return (list(current_q) + [0.0] * n)[:n]
    return [0.0] * n


def _effective_numeric_config(
    ik_spec: "IKSpec | None",
    overrides: "IKOverrides | None",
) -> "IKNumericConfig | None":
    if overrides and overrides.numeric:
        return overrides.numeric
    if ik_spec:
        return ik_spec.numeric
    return None


def _numeric_fallback(
    dh: "DHChainValues",
    n: int,
    target: list[float],
    ee: "EndEffectorSpec | None",
    seed: list[float],
    config: "IKNumericConfig | None",
) -> list[float]:
    from brain.service.ik.numeric import solve_numeric

    result = solve_numeric(dh, list(range(n)), target, ee, seed=seed, config=config)
    if result is None:
        raise IKNoSolution("Numeric IK failed to converge.", residual_m=float("inf"))
    return result


def _position_residual(
    dh: "DHChainValues",
    q: list[float],
    target: list[float],
    ee: "EndEffectorSpec | None",
) -> float:
    from brain.service.dh_fk import ee_position_with_spec

    x, y, z = ee_position_with_spec(dh, q, ee)
    tx = target[0] if len(target) > 0 else 0.0
    ty = target[1] if len(target) > 1 else 0.0
    tz = target[2] if len(target) > 2 else 0.0
    return math.sqrt((x - tx)**2 + (y - ty)**2 + (z - tz)**2)


def _apply_branch_override(ik_spec: "IKSpec", branch: str) -> "IKSpec":
    """Return a shallow copy of ik_spec with branch_preference overridden on all blocks."""
    from brain.models.machine import IKSpec, IKBlock

    new_blocks = [
        IKBlock(
            kind=b.kind,
            joints=b.joints,
            branch_preference=branch,
            plane=b.plane,
        )
        for b in ik_spec.decomposition
    ]
    return IKSpec(
        decomposition=new_blocks,
        numeric=ik_spec.numeric,
        redundancy=ik_spec.redundancy,
    )


def _polish_config(base: "IKNumericConfig | None") -> "IKNumericConfig":
    from brain.models.machine import IKNumericConfig

    if base is None:
        return IKNumericConfig(max_iters=50)
    return IKNumericConfig(
        max_iters=max(20, base.max_iters // 3),
        pos_tol_m=base.pos_tol_m,
        rot_tol_rad=base.rot_tol_rad,
        damping=base.damping,
        seed=base.seed,
    )
