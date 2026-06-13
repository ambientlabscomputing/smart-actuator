import math
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from brain.models.machine import (
    KNOWN_IK_BLOCK_KINDS,
    DHChainSchema,
    DHFieldSpec,
    DHJointSpec,
    EasyAlias,
    EndEffectorSpec,
    IKBlock,
    IKNumericConfig,
    IKRedundancyConfig,
    IKSpec,
    TemplateMeta,
)
from brain.utils.config import Config
from brain.utils.logger import logger


class TemplateParamSchema(TemplateMeta):
    """TemplateMeta extended with the full parameter schema list for the UI wizard."""

    parameters: list[dict] = []
    joints: list[dict] = []
    dh: DHChainSchema | None = None
    easy: list[EasyAlias] = []
    end_effector: EndEffectorSpec | None = None
    ik: IKSpec | None = None


class TemplateUpdateInfo:
    def __init__(self, template_id: str, current_version: str, available_version: str) -> None:
        self.template_id = template_id
        self.current_version = current_version
        self.available_version = available_version


class TemplateService:
    """
    Manages the in-tree template catalogue.

    Templates live under brain/templates/<id>/template.yaml alongside a
    model.urdf.j2 Jinja2 URDF skeleton.  Each template.yaml carries:
      - id, name, version, publisher, summary
      - parameters[]: {name, label, type, default, min, max, unit, description}
      - joints[]: {slot, name, axis, parent}

    expand() substitutes parameter values and a few derived quantities
    (e.g. joint limits converted from degrees to radians) into the URDF.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._templates_dir = Path(config.templates.dir)

    async def list_templates(self) -> list[TemplateMeta]:
        """Return summary metadata for all in-tree templates."""
        metas: list[TemplateMeta] = []
        if not self._templates_dir.exists():
            return metas
        for manifest in sorted(self._templates_dir.glob("*/template.yaml")):
            try:
                data = yaml.safe_load(manifest.read_text())
                metas.append(self._parse_meta(data))
            except Exception:
                logger.exception("TemplateService: failed to parse {}", manifest)
        return metas

    async def get_template(self, template_id: str) -> TemplateParamSchema | None:
        """Return full schema (including parameters + joints + dh + easy) for a single template."""
        manifest = self._templates_dir / template_id / "template.yaml"
        if not manifest.exists():
            return None
        try:
            data = yaml.safe_load(manifest.read_text())
            meta = self._parse_meta(data)
            dh_schema = self._parse_dh_schema(data) if "dh" in data else None
            easy = self._parse_easy(data) if "easy" in data else []
            end_effector = self._parse_end_effector(data) if "end_effector" in data else None
            ik = self._parse_ik(data) if "ik" in data else None
            return TemplateParamSchema(
                **meta.model_dump(),
                parameters=data.get("parameters", []),
                joints=data.get("joints", []),
                dh=dh_schema,
                easy=easy,
                end_effector=end_effector,
                ik=ik,
            )
        except Exception:
            logger.exception("TemplateService: failed to parse {}", manifest)
            return None

    def expand(self, template_id: str, params: dict) -> str:
        """
        Expand model.urdf.j2 with the given parameter values.
        Automatically derives *_limit_rad from *_limit_deg for convenience.
        """
        urdf_path = self._templates_dir / template_id / "model.urdf.j2"
        if not urdf_path.exists():
            raise FileNotFoundError(f"URDF template not found: {urdf_path}")

        env = Environment(
            loader=FileSystemLoader(str(urdf_path.parent)),
            undefined=StrictUndefined,
            autoescape=False,
        )
        template = env.get_template(urdf_path.name)

        # Derive radian limits from degree parameters for cleaner URDF templates.
        ctx: dict = dict(params)
        for key, val in list(params.items()):
            if key.endswith("_limit_deg"):
                rad_key = key.replace("_limit_deg", "_limit_rad")
                ctx[rad_key] = math.radians(float(val))

        return template.render(**ctx)

    async def update_templates(self) -> list[TemplateUpdateInfo]:
        """No-op for in-tree templates (no remote fetch needed)."""
        return []

    def is_trusted_source(self, source_url: str) -> bool:
        return any(
            source_url.startswith(prefix) for prefix in self._config.templates.trusted_sources
        )

    @staticmethod
    def _parse_meta(data: dict) -> TemplateMeta:
        return TemplateMeta(
            template_id=data["id"],
            name=data.get("name", data["id"]),
            summary=data.get("summary", ""),
            version=data.get("version", "0.0.0"),
            publisher=data.get("publisher", ""),
            source="in-tree",
            brain_compatibility=data.get("brain_compatibility", ""),
            firmware_compatibility=data.get("firmware_compatibility", ""),
        )

    @staticmethod
    def _parse_field_spec(raw: object, *, default: float = 0.0) -> DHFieldSpec:
        """Parse a DH field spec from YAML.  Accepts a plain number or a dict."""
        if isinstance(raw, (int, float)):
            return DHFieldSpec(default=float(raw))
        if isinstance(raw, dict):
            return DHFieldSpec(
                default=float(raw.get("default", default)),
                min=float(raw["min"]) if "min" in raw else None,
                max=float(raw["max"]) if "max" in raw else None,
                unit=str(raw.get("unit", "")),
                editable=bool(raw.get("editable", True)),
            )
        return DHFieldSpec(default=default)

    @classmethod
    def _parse_dh_schema(cls, data: dict) -> DHChainSchema:
        """Parse the template's dh: block into a DHChainSchema."""
        dh_raw = data.get("dh", {})
        link_radius = cls._parse_field_spec(dh_raw.get("link_radius", 0.03), default=0.03)
        joints: list[DHJointSpec] = []
        for j in dh_raw.get("joints", []):
            joints.append(
                DHJointSpec(
                    name=j["name"],
                    slot=int(j["slot"]),
                    type=j.get("type", "revolute"),
                    axis=j.get("axis", "z"),
                    a=cls._parse_field_spec(j.get("a", 0.0)),
                    d=cls._parse_field_spec(j.get("d", 0.0)),
                    alpha=cls._parse_field_spec(j.get("alpha", 0.0), default=0.0),
                    theta_offset=cls._parse_field_spec(j.get("theta_offset", 0.0), default=0.0),
                    limit_lower=cls._parse_field_spec(j.get("limit_lower", -180.0), default=-180.0),
                    limit_upper=cls._parse_field_spec(j.get("limit_upper", 180.0), default=180.0),
                    mass=cls._parse_field_spec(j.get("mass", 0.5), default=0.5),
                )
            )
        return DHChainSchema(link_radius=link_radius, joints=joints)

    @staticmethod
    def _parse_easy(data: dict) -> list[EasyAlias]:
        """Parse the template's easy: list into EasyAlias objects."""
        aliases: list[EasyAlias] = []
        for entry in data.get("easy", []):
            aliases.append(
                EasyAlias(
                    legacy_param=entry["legacy_param"],
                    label=entry.get("label", entry["legacy_param"]),
                    unit=entry.get("unit", ""),
                    description=entry.get("description", ""),
                    target=entry["target"],
                )
            )
        return aliases

    @staticmethod
    def _parse_end_effector(data: dict) -> EndEffectorSpec:
        """Parse the template's end_effector: block into an EndEffectorSpec."""
        raw = data.get("end_effector", {})
        return EndEffectorSpec(
            parent=raw["parent"],
            offset_m=raw.get("offset_m", [0.0, 0.0, 0.0]),
            orientation_offset_deg=raw.get("orientation_offset_deg", [0.0, 0.0, 0.0]),
            task_space=raw.get("task_space", "se3"),
        )

    @classmethod
    def _parse_ik(cls, data: dict) -> IKSpec:
        """
        Parse the template's ik: block into an IKSpec.
        Rejects any block with an unrecognised kind so templates can't silently
        request a solver the Brain doesn't have.
        """
        raw = data.get("ik", {})

        blocks: list[IKBlock] = []
        for i, b in enumerate(raw.get("decomposition", [])):
            kind = str(b.get("kind", ""))
            if kind not in KNOWN_IK_BLOCK_KINDS:
                raise ValueError(
                    f"ik.decomposition[{i}] has unknown kind {kind!r}. "
                    f"Valid kinds: {sorted(KNOWN_IK_BLOCK_KINDS)}"
                )
            blocks.append(
                IKBlock(
                    kind=kind,
                    joints=[int(j) for j in b.get("joints", [])],
                    branch_preference=b.get("branch_preference", "nearest"),
                    plane=b.get("plane", ""),
                )
            )

        numeric_raw = raw.get("numeric", {})
        numeric = IKNumericConfig(
            max_iters=int(numeric_raw.get("max_iters", 150)),
            pos_tol_m=float(numeric_raw.get("pos_tol_m", 1e-4)),
            rot_tol_rad=float(numeric_raw.get("rot_tol_rad", 1e-3)),
            damping=float(numeric_raw.get("damping", 0.01)),
            seed=str(numeric_raw.get("seed", "current_q")),
        )

        redundancy_raw = raw.get("redundancy", {})
        redundancy = IKRedundancyConfig(
            nullspace_objective=str(redundancy_raw.get("nullspace_objective", "keep_near_seed")),
        )

        return IKSpec(decomposition=blocks, numeric=numeric, redundancy=redundancy)
