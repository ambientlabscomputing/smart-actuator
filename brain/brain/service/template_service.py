from brain.models.machine import TemplateMeta
from brain.utils.config import Config
from brain.utils.logger import logger


class TemplateUpdateInfo:
    def __init__(self, template_id: str, current_version: str, available_version: str) -> None:
        self.template_id = template_id
        self.current_version = current_version
        self.available_version = available_version


class TemplateService:
    """
    Manages the template catalogue (C1).

    Templates live in git. The Brain bundles a cached snapshot at install
    time for offline operation; an explicit update action pulls the latest
    from upstream. A trusted-source allowlist controls which origins load
    without a provenance warning.
    """

    def __init__(self, config: Config) -> None:
        self._config = config

    async def list_templates(self) -> list[TemplateMeta]:
        """Return all templates available in the local cache."""
        # TODO: scan self._config.template_cache_dir for template.yaml manifests
        return []

    async def get_template(self, template_id: str) -> TemplateMeta | None:
        """Return metadata for a single template by ID."""
        # TODO: load template.yaml from cache
        return None

    async def update_templates(self) -> list[TemplateUpdateInfo]:
        """
        Pull the latest template versions from all configured remotes and
        return a summary of what changed. Does NOT rewrite existing machine
        descriptions — callers must explicitly re-bind to adopt a new version.
        """
        logger.info("Checking for template updates")
        # TODO: git fetch / pull for each configured template source
        return []

    def is_trusted_source(self, source_url: str) -> bool:
        """Return True if *source_url* matches an entry in the trusted-source allowlist."""
        return any(
            source_url.startswith(prefix) for prefix in self._config.trusted_template_sources
        )
