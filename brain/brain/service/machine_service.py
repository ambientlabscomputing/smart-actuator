from brain.models.machine import Machine, MachineDescription
from brain.repository.repository import Repository
from brain.service.template_service import TemplateService
from brain.utils.config import Config
from brain.utils.logger import logger


class MachineService:
    """
    Builds and maintains the canonical machine model (C1).

    Accepts a (template_ref, parameters, actuator_bindings) description,
    expands it into a concrete URDF, runs bind-time recipes to compute
    reach/collision/IK caches, and persists the description to SQLite.
    The expanded URDF and caches are derived; the small description tuple
    is the source of truth.
    """

    def __init__(
        self,
        repository: Repository,
        template_service: TemplateService,
        config: Config,
    ) -> None:
        self._repository = repository
        self._templates = template_service
        self._config = config

    async def build_machine(self, description: MachineDescription) -> Machine:
        """
        Expand the description into a Machine: resolve the template,
        substitute parameters into the URDF skeleton, then run bind-time recipes.
        """
        logger.info(
            "Building machine %s from template %s",
            description.machine_id,
            description.template_ref.template_id,
        )
        # TODO: load template, substitute parameters, produce expanded URDF
        machine = Machine(description=description)
        machine = await self._run_bind_time_recipes(machine)
        await self.save_machine(machine)
        return machine

    async def get_machine(self, machine_id: str) -> Machine | None:
        """Load a persisted machine description from the repository."""
        # TODO: load from SQLite via repository
        return None

    async def list_machines(self) -> list[str]:
        """Return all known machine IDs."""
        # TODO: query repository
        return []

    async def save_machine(self, machine: Machine) -> None:
        """Persist the machine description (not the URDF) to SQLite."""
        # TODO: upsert into repository
        logger.debug("Saving machine %s", machine.description.machine_id)

    async def expand_urdf(self, description: MachineDescription) -> str:
        """
        Resolve the template and substitute parameter values to produce
        a concrete URDF string without persisting anything.
        """
        # TODO: load template skeleton, apply parameter substitutions
        return ""

    async def _run_bind_time_recipes(self, machine: Machine) -> Machine:
        """
        Execute the template's recipes against the bound parameters to
        populate reach_volume_cache and collision_bounds_cache.
        """
        # TODO: call template recipes (closed-form or MuJoCo-based)
        logger.debug("Running bind-time recipes for machine %s", machine.description.machine_id)
        return machine

    async def bind_actuators(self, machine_id: str, actuator_ids: list[str]) -> None:
        """
        (Re-)bind a list of actuator IDs to the joint slots of an existing machine.
        Index i in *actuator_ids* maps to joint slot i.
        """
        # TODO: update bindings in repository
        logger.info("Binding actuators to machine %s", machine_id)
