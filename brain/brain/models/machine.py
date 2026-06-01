import json
import math

from pydantic import BaseModel, Field
from sqlalchemy.orm import Mapped, mapped_column

from brain.models.base import SqlBase


# ── DH kinematics models ──────────────────────────────────────────────────────


class DHFieldSpec(BaseModel):
    """Descriptor for a single numeric DH field as declared in template.yaml."""

    default: float
    min: float | None = None
    max: float | None = None
    unit: str = ""
    editable: bool = True


class DHJointSpec(BaseModel):
    """
    Schema for one joint row in the template's dh.joints[] list.
    All numeric DH fields are specs; name/slot/type/axis are plain values.
    """

    name: str
    slot: int
    type: str = "revolute"
    axis: str = "z"
    a: DHFieldSpec = Field(default_factory=lambda: DHFieldSpec(default=0.0))
    d: DHFieldSpec = Field(default_factory=lambda: DHFieldSpec(default=0.0))
    alpha: DHFieldSpec = Field(default_factory=lambda: DHFieldSpec(default=0.0, unit="deg"))
    theta_offset: DHFieldSpec = Field(
        default_factory=lambda: DHFieldSpec(default=0.0, unit="deg")
    )
    limit_lower: DHFieldSpec = Field(
        default_factory=lambda: DHFieldSpec(default=-180.0, unit="deg")
    )
    limit_upper: DHFieldSpec = Field(
        default_factory=lambda: DHFieldSpec(default=180.0, unit="deg")
    )
    mass: DHFieldSpec = Field(default_factory=lambda: DHFieldSpec(default=0.5, unit="kg"))


class DHChainSchema(BaseModel):
    """
    Full DH chain schema parsed from a template's dh: block.
    Passed to dh_urdf.py to generate URDF and to the UI for Advanced editing.
    """

    link_radius: DHFieldSpec = Field(
        default_factory=lambda: DHFieldSpec(default=0.03, unit="m")
    )
    joints: list[DHJointSpec] = Field(default_factory=list)


class EasyAlias(BaseModel):
    """One entry in the template's easy: list — a friendly alias onto a DH field."""

    legacy_param: str
    label: str
    unit: str = ""
    description: str = ""
    target: str  # dot-path into DHChainValues, e.g. "joints[0].a"


# ── End-effector & IK models ──────────────────────────────────────────────────


class TaskSpace(str):
    """
    How many dimensions of the EE pose the IK solver is responsible for.
    planar_xz / planar_xy — 2-D position in that plane.
    r3  — 3-D position only, no orientation.
    se3 — full 6-DOF pose (position + orientation).
    """
    PLANAR_XZ = "planar_xz"
    PLANAR_XY = "planar_xy"
    R3 = "r3"
    SE3 = "se3"


class EndEffectorSpec(BaseModel):
    """
    Top-level template/machine concept describing where the end-effector
    frame is relative to the last joint in the DH chain.

    Seeded from the template's end_effector: block; persisted on the machine
    so users can tweak the tool offset without forking the template.
    """

    parent: str = Field(
        description="Name of the joint whose frame the EE is attached to "
                    "(usually the last joint in the chain)."
    )
    offset_m: list[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0],
        description="Translation [x, y, z] in metres from the parent joint origin to the EE.",
    )
    orientation_offset_deg: list[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0],
        description="Intrinsic RPY rotation (degrees) from parent joint frame to EE frame.",
    )
    task_space: str = Field(
        default="se3",
        description="planar_xz | planar_xy | r3 | se3 — dimensionality of the IK task.",
    )


class IKBlockKind(str):
    """Closed registry of recognised decomposition block kinds."""
    REVOLUTE = "revolute"
    PRISMATIC = "prismatic"
    PLANAR_2R = "planar_2r"
    PLANAR_3R = "planar_3r"
    RRR_ANTHROPOMORPHIC = "rrr_anthropomorphic"
    SPHERICAL_WRIST = "spherical_wrist"
    NUMERIC = "numeric"  # escape hatch: this block is solved numerically


KNOWN_IK_BLOCK_KINDS: frozenset[str] = frozenset({
    "revolute",
    "prismatic",
    "planar_2r",
    "planar_3r",
    "rrr_anthropomorphic",
    "spherical_wrist",
    "numeric",
})


class IKBlock(BaseModel):
    """One block in a decomposition — a contiguous slice of joints and a solver hint."""

    kind: str = Field(
        description="Solver family for this block — must be a key in KNOWN_IK_BLOCK_KINDS."
    )
    joints: list[int] = Field(
        description="Ordered list of joint *slot* indices that belong to this block."
    )
    # Block-specific options (only used where relevant):
    branch_preference: str = Field(
        default="nearest",
        description="elbow_up | elbow_down | nearest — selects the analytic branch "
                    "when the block has two solutions (e.g. planar_2r).",
    )
    plane: str = Field(
        default="",
        description="For planar blocks: disambiguates which plane the chain lives in "
                    "(yz_of_parent | xz_of_parent | xy_of_parent). Inferred from DH if empty.",
    )


class IKNumericConfig(BaseModel):
    """Settings for the Jacobian (damped least squares) numeric fallback solver."""

    max_iters: int = Field(default=150, ge=1, le=2000)
    pos_tol_m: float = Field(default=1e-4, gt=0.0)
    rot_tol_rad: float = Field(default=1e-3, gt=0.0)
    damping: float = Field(default=0.01, ge=0.0)
    seed: str = Field(
        default="current_q",
        description="current_q | zero | sampled — initial joint-state guess for the solver.",
    )


class IKRedundancyConfig(BaseModel):
    """Policy for nullspace-DOF use when the mechanism has more DOF than the task requires."""

    nullspace_objective: str = Field(
        default="keep_near_seed",
        description="keep_near_seed | center_limits | none.",
    )


class IKSpec(BaseModel):
    """
    Parsed representation of the template's ik: block.
    Both fields are optional; omitting decomposition means numeric-only.
    """

    decomposition: list[IKBlock] = Field(
        default_factory=list,
        description="Ordered blocks partitioning the joint space. "
                    "Empty → pure numeric fallback.",
    )
    numeric: IKNumericConfig = Field(default_factory=IKNumericConfig)
    redundancy: IKRedundancyConfig = Field(default_factory=IKRedundancyConfig)


class IKBlockVerification(BaseModel):
    """Per-block result from the build-time geometric verifier."""

    block_index: int
    kind: str
    joints: list[int]
    status: str = Field(description="ok | warning | error")
    reason: str = ""


class IKVerification(BaseModel):
    """
    Full verifier report produced at machine-build time.
    Persisted on the Machine so the UI can show it without recomputing.
    """

    strategy: str = Field(
        description="analytic | numeric — the strategy that will be used at runtime."
    )
    blocks: list[IKBlockVerification] = Field(default_factory=list)
    summary: str = ""
    verified_at: str = ""


class IKOverrides(BaseModel):
    """
    Machine-level user overrides for IK behaviour.
    Persisted on MachineDescription; survives template updates.
    """

    force_numeric: bool = Field(
        default=False,
        description="When true, always use the Jacobian numeric solver regardless of decomposition.",
    )
    numeric: IKNumericConfig | None = Field(
        default=None,
        description="Override numeric solver settings. None → use template defaults.",
    )


class DHJointValues(BaseModel):
    """Stored per-machine values for one joint in the DH chain."""

    name: str
    slot: int
    a: float = 0.0
    d: float = 0.0
    alpha: float = 0.0      # stored in degrees; converted to rad by dh_urdf
    theta_offset: float = 0.0  # degrees
    limit_lower: float = -180.0  # degrees
    limit_upper: float = 180.0   # degrees
    mass: float = 0.5


class DHChainValues(BaseModel):
    """
    The per-machine DH chain values stored in MachineDescription.dh_chain.
    These are the source of truth; the legacy parameters dict is derived from them.
    """

    link_radius: float = 0.03
    joints: list[DHJointValues] = Field(default_factory=list)

    @classmethod
    def from_schema_defaults(cls, schema: DHChainSchema) -> "DHChainValues":
        """Seed values from template schema defaults."""
        return cls(
            link_radius=schema.link_radius.default,
            joints=[
                DHJointValues(
                    name=j.name,
                    slot=j.slot,
                    a=j.a.default,
                    d=j.d.default,
                    alpha=j.alpha.default,
                    theta_offset=j.theta_offset.default,
                    limit_lower=j.limit_lower.default,
                    limit_upper=j.limit_upper.default,
                    mass=j.mass.default,
                )
                for j in schema.joints
            ],
        )

    def to_legacy_parameters(self, easy: list[EasyAlias]) -> dict[str, float]:
        """
        Derive the legacy parameters dict via the easy aliases so that existing
        consumers (bind_slot, legacy REST clients) continue to work.
        """
        params: dict[str, float] = {}
        for alias in easy:
            target = alias.target
            try:
                val = _resolve_dh_target(self, target, write=None)
                # limit_symmetric reads the upper limit (positive half)
                params[alias.legacy_param] = val
            except Exception:
                pass
        return params

    def apply_easy_alias(self, target: str, value: float) -> None:
        """Write a value through an easy alias target (mutates in place)."""
        _resolve_dh_target(self, target, write=value)

    def read_easy_alias(self, target: str) -> float:
        """Read the current value for an easy alias target."""
        return _resolve_dh_target(self, target, write=None)


def _resolve_dh_target(chain: DHChainValues, target: str, *, write: float | None) -> float:
    """
    Generic resolver for easy alias targets like "joints[0].a" or "link_radius"
    or "joints[0].limit_symmetric".

    When write is None: reads the field and returns its value.
    When write is a float: writes the field and returns the new value.
    """
    import re

    # "link_radius"
    if target == "link_radius":
        if write is not None:
            chain.link_radius = write
        return chain.link_radius

    # "joints[N].field"
    m = re.fullmatch(r"joints\[(\d+)\]\.(\w+)", target)
    if not m:
        raise ValueError(f"Cannot resolve DH target: {target!r}")

    idx = int(m.group(1))
    field = m.group(2)
    joint = chain.joints[idx]

    if field == "limit_symmetric":
        # Easy mode writes ±value in degrees; advanced stores separate lower/upper.
        # Reading: return the upper limit (positive half, unsigned).
        if write is not None:
            abs_val = abs(write)
            joint.limit_lower = -abs_val
            joint.limit_upper = abs_val
        return joint.limit_upper  # return unsigned magnitude
    elif field in {"a", "d", "alpha", "theta_offset", "limit_lower", "limit_upper", "mass"}:
        if write is not None:
            setattr(joint, field, write)
        return getattr(joint, field)
    else:
        raise ValueError(f"Unknown DH joint field: {field!r}")


class TemplateRef(BaseModel):
    """Identifies a specific template version in a git-hosted catalogue."""

    source: str
    template_id: str
    version: str
    content_hash: str
    ref: str = Field(description="Git tag, branch, or SHA — floating or pinned")


class TemplateMeta(BaseModel):
    """Summary information about a template from the catalogue."""

    template_id: str
    name: str
    summary: str
    version: str
    publisher: str
    source: str
    brain_compatibility: str = ""
    firmware_compatibility: str = ""


class MachineDescription(BaseModel):
    """
    The minimal user-authored description of a machine: which template,
    what parameter values, and which actuators are bound to which joints.
    This is the source of truth persisted across restarts, not the expanded URDF.

    dh_chain is the canonical kinematics representation (source of truth).
    parameters is a derived projection kept in sync for backward-compat consumers.
    end_effector is seeded from the template and can be overridden per-machine.
    ik_overrides persists user-level IK settings (e.g. force_numeric).
    """

    machine_id: str
    template_ref: TemplateRef
    dh_chain: DHChainValues | None = Field(
        default=None,
        description="DH chain values (source of truth). Seeded from parameters when absent.",
    )
    parameters: dict[str, float | str] = Field(
        default_factory=dict,
        description="Derived legacy projection via easy aliases; kept in sync automatically.",
    )
    actuator_bindings: list[str] = Field(
        default_factory=list,
        description="Actuator IDs in joint-slot order; index i → joint slot i",
    )
    end_effector: EndEffectorSpec | None = Field(
        default=None,
        description="EE frame relative to last joint. Seeded from template on first load; "
                    "nullable so existing machines migrate lazily.",
    )
    ik_overrides: IKOverrides = Field(
        default_factory=IKOverrides,
        description="Machine-level user overrides for IK strategy and numeric tunables.",
    )


class WorkspaceHull(BaseModel):
    """
    Convex hull of the reachable end-effector workspace.
    Vertices and faces use a compressed index (faces index into vertices list).
    equations is a list of hyperplane coefficients [a, b, c, d] where
    a*x + b*y + c*z + d <= 0 for interior points (scipy convention).
    """

    vertices: list[list[float]] = Field(default_factory=list)   # [[x,y,z], ...]
    faces: list[list[int]] = Field(default_factory=list)        # [[i,j,k], ...]
    equations: list[list[float]] = Field(default_factory=list)  # [[a,b,c,d], ...]
    volume: float = 0.0
    area: float = 0.0


class WorkspaceResult(BaseModel):
    """
    Computed reachable workspace for a machine's end-effector.
    Persisted as workspace_json alongside the machine in SQLite.
    """

    dh_hash: str = ""                              # SHA-256 of canonical dh_chain JSON
    points: list[tuple[float, float, float]] = Field(default_factory=list)
    hull: WorkspaceHull | None = None
    bounds: dict[str, list[float]] = Field(default_factory=dict)  # {"min": [x,y,z], "max": ...}
    stats: dict[str, float] = Field(default_factory=dict)
    generated_at: str = ""


class Machine(BaseModel):
    """
    The runtime representation of a bound machine: the description plus
    the expanded URDF and bind-time computed caches.
    """

    description: MachineDescription
    expanded_urdf: str = ""
    workspace: WorkspaceResult | None = None
    ik_verification: IKVerification | None = Field(
        default=None,
        description="Build-time geometric verifier report for the IK decomposition.",
    )
    reach_volume_cache: dict[str, float] = Field(default_factory=dict)
    collision_bounds_cache: dict[str, object] = Field(default_factory=dict)
    joint_names: list[str] = Field(default_factory=list)


class SqlMachine(SqlBase):
    __tablename__ = "machines"

    machine_id: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    description_json: Mapped[str] = mapped_column(nullable=False)
    expanded_urdf: Mapped[str] = mapped_column(nullable=False, default="")
    workspace_json: Mapped[str | None] = mapped_column(nullable=True, default=None)

    def to_machine(self) -> Machine:
        description = MachineDescription.model_validate(json.loads(self.description_json))
        workspace: WorkspaceResult | None = None
        if self.workspace_json:
            try:
                workspace = WorkspaceResult.model_validate(json.loads(self.workspace_json))
            except Exception:
                workspace = None
        return Machine(
            description=description,
            expanded_urdf=self.expanded_urdf,
            workspace=workspace,
        )


class SqlSimEntry(SqlBase):
    __tablename__ = "sim_registry"

    machine_id: Mapped[str] = mapped_column(nullable=False, index=True)
    slot: Mapped[int] = mapped_column(nullable=False)
    address: Mapped[str] = mapped_column(nullable=False)
    pid: Mapped[int] = mapped_column(nullable=False)
    actuator_id: Mapped[str] = mapped_column(nullable=False)
    joint_name: Mapped[str] = mapped_column(nullable=False, default="")


class SqlHardwareEntry(SqlBase):
    __tablename__ = "hardware_registry"

    machine_id: Mapped[str] = mapped_column(nullable=False, index=True)
    slot: Mapped[int] = mapped_column(nullable=False)
    address: Mapped[str] = mapped_column(nullable=False)
    actuator_id: Mapped[str] = mapped_column(nullable=False)
    joint_name: Mapped[str] = mapped_column(nullable=False, default="")
