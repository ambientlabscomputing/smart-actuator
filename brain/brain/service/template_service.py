import math
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from brain.models.machine import TemplateMeta
from brain.utils.config import Config
from brain.utils.logger import logger


class TemplateParamSchema(TemplateMeta):
    """TemplateMeta extended with the full parameter schema list for the UI wizard."""
    parameters: list[dict] = []
    joints: list[dict] = []


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
        self._templates_dir = Path(config.templates_dir)

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
        """Return full schema (including parameters + joints) for a single template."""
        manifest = self._templates_dir / template_id / "template.yaml"
        if not manifest.exists():
            return None
        try:
            data = yaml.safe_load(manifest.read_text())
            meta = self._parse_meta(data)
            return TemplateParamSchema(
                **meta.model_dump(),
                parameters=data.get("parameters", []),
                joints=data.get("joints", []),
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
            source_url.startswith(prefix) for prefix in self._config.trusted_template_sources
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

