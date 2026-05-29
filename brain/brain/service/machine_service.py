import math
from typing import TYPE_CHECKING

from brain.models.machine import Machine, MachineDescription
from brain.repository.repository import Repository
from brain.service.template_service import TemplateService
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.service.sim_lifecycle_service import SimLifecycleService
    from brain.service.hardware_lifecycle_service import HardwareLifecycleService


class MachineService:
    """
    Builds and maintains the canonical machine model (C1).

    Accepts a (template_ref, parameters, actuator_bindings) description,
    expands it into a concrete URDF, and persists the result to SQLite.
    Per-slot bindings are managed here: bind_slot delegates to
    SimLifecycleService when kind="sim".
    """

    def __init__(
        self,
        repository: Repository,
        template_service: TemplateService,
        config: Config,
        *,
        sim_lifecycle: "SimLifecycleService | None" = None,
        hardware_lifecycle: "HardwareLifecycleService | None" = None,
    ) -> None:
        self._repository = repository
        self._templates = template_service
        self._config = config
        self._sim_lifecycle = sim_lifecycle  # injected after construction to break circular dep
        self._hardware_lifecycle = hardware_lifecycle

    def set_sim_lifecycle(self, sim_lifecycle: "SimLifecycleService") -> None:
        self._sim_lifecycle = sim_lifecycle

    def set_hardware_lifecycle(self, hardware_lifecycle: "HardwareLifecycleService") -> None:
        self._hardware_lifecycle = hardware_lifecycle

    async def build_machine(self, description: MachineDescription) -> Machine:
        """
        Expand the description into a Machine: resolve the template,
        substitute parameters into the URDF skeleton, persist.
        """
        logger.info(
            "Building machine {} from template {}",
            description.machine_id,
            description.template_ref.template_id,
        )
        template_id = description.template_ref.template_id

        # Expand URDF — store for J6/J7 without requiring a schema migration.
        expanded_urdf = ""
        try:
            expanded_urdf = self._templates.expand(template_id, dict(description.parameters))
        except Exception:
            logger.exception(
                "URDF expansion failed for template {}; storing empty URDF", template_id
            )

        # Derive joint names from the template joint list.
        tmpl = await self._templates.get_template(template_id)
        joint_names = (
            [j["name"] for j in tmpl.joints]
            if tmpl and tmpl.joints
            else [f"joint{i}" for i in range(max(len(description.actuator_bindings), 1))]
        )

        machine = Machine(
            description=description,
            expanded_urdf=expanded_urdf,
            joint_names=joint_names,
        )

        await self._persist(machine)
        logger.info("Machine {} persisted ({} joints)", description.machine_id, len(joint_names))
        return machine

    async def get_machine(self, machine_id: str) -> Machine | None:
        row = await self._repository.machine.load_machine(machine_id)
        if row is None:
            return None
        try:
            description = MachineDescription(**row["description"])
            # Derive joint names from the template.
            tmpl = await self._templates.get_template(description.template_ref.template_id)
            joint_names = (
                [j["name"] for j in tmpl.joints]
                if tmpl and tmpl.joints
                else [f"joint{i}" for i in range(max(len(description.actuator_bindings), 1))]
            )
            return Machine(
                description=description,
                expanded_urdf=row.get("expanded_urdf", ""),
                joint_names=joint_names,
            )
        except Exception:
            logger.exception("Failed to deserialize machine {}", machine_id)
            return None

    async def list_machines(self) -> list[str]:
        return await self._repository.machine.list_machines()

    async def bind_slot(
        self,
        machine_id: str,
        slot: int,
        *,
        kind: str,
        ip: str | None = None,
        port: int | None = None,
        serial_path: str | None = None,
        baud_rate: int = 921_600,
        actuator_id: str | None = None,
    ) -> dict[str, object]:
        """
        Bind a single joint slot.

        kind="sim"      → spawn an actuator-sim, register with Sidecar, persist.
        kind="hardware" → register an existing hardware endpoint, persist.
                          Supports TCP (ip + port) or USB-CDC (serial_path).
        kind="unbound"  → tear down any existing binding for this slot.
        """
        machine = await self.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")

        if slot < 0 or slot >= len(machine.joint_names):
            raise ValueError(
                f"Slot {slot} out of range for machine {machine_id!r} "
                f"({len(machine.joint_names)} joints)"
            )

        joint_name = machine.joint_names[slot]

        if kind == "sim":
            if self._sim_lifecycle is None:
                raise RuntimeError("SimLifecycleService not wired — cannot spawn sim")
            limit_deg = float(machine.description.parameters.get(f"joint{slot}_limit_deg", 180.0))
            limit_rad = math.radians(limit_deg)
            address, pid, actuator_id = await self._sim_lifecycle.spawn_sim(
                machine_id, slot, joint_name=joint_name, limit_rad=limit_rad
            )

            bindings = list(machine.description.actuator_bindings)
            while len(bindings) <= slot:
                bindings.append("")
            bindings[slot] = actuator_id
            machine.description.actuator_bindings = bindings
            await self._persist(machine)

            return {
                "machine_id": machine_id,
                "slot": slot,
                "kind": "sim",
                "actuator_id": actuator_id,
                "address": address,
                "pid": pid,
            }

        elif kind == "hardware":
            if not ip and not serial_path:
                raise ValueError("kind='hardware' requires ip+port (TCP) or serial_path (USB-CDC)")
            if self._hardware_lifecycle is None:
                raise RuntimeError("HardwareLifecycleService not wired — cannot bind hardware")
            limit_deg = float(machine.description.parameters.get(f"joint{slot}_limit_deg", 180.0))
            limit_rad = math.radians(limit_deg)
            address, bound_actuator_id = await self._hardware_lifecycle.bind_hardware(
                machine_id,
                slot,
                joint_name=joint_name,
                ip=ip,
                port=port,
                serial_path=serial_path,
                baud_rate=baud_rate,
                actuator_id=actuator_id,
                limit_rad=limit_rad,
            )

            bindings = list(machine.description.actuator_bindings)
            while len(bindings) <= slot:
                bindings.append("")
            bindings[slot] = bound_actuator_id
            machine.description.actuator_bindings = bindings
            await self._persist(machine)

            return {
                "machine_id": machine_id,
                "slot": slot,
                "kind": "hardware",
                "actuator_id": bound_actuator_id,
                "address": address,
                "pid": None,
            }

        elif kind == "unbound":
            if self._sim_lifecycle is not None:
                await self._sim_lifecycle.teardown_sim(machine_id, slot)
            if self._hardware_lifecycle is not None:
                await self._hardware_lifecycle.teardown_hardware(machine_id, slot)

            bindings = list(machine.description.actuator_bindings)
            if slot < len(bindings):
                bindings[slot] = ""
            machine.description.actuator_bindings = bindings
            await self._persist(machine)

            return {"machine_id": machine_id, "slot": slot, "kind": "unbound"}

        else:
            raise ValueError(f"Unknown binding kind {kind!r}. Valid: 'sim', 'hardware', 'unbound'")

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _persist(self, machine: Machine) -> None:
        await self._repository.machine.save_machine(
            machine.description.machine_id,
            {
                "description": machine.description.model_dump(),
                "expanded_urdf": machine.expanded_urdf,
            },
        )

    async def save_machine(self, machine: Machine) -> None:
        await self._persist(machine)

    async def expand_urdf(self, description: MachineDescription) -> str:
        try:
            return self._templates.expand(
                description.template_ref.template_id, dict(description.parameters)
            )
        except Exception:
            logger.exception("expand_urdf failed")
            return ""

    async def bind_actuators(self, machine_id: str, actuator_ids: list[str]) -> None:
        """Legacy: bind a complete ordered list of actuator IDs to the machine."""
        machine = await self.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")
        machine.description.actuator_bindings = actuator_ids
        await self._persist(machine)
        logger.info("Bound actuators to machine {}", machine_id)

    async def update_parameters(
        self, machine_id: str, parameters: dict[str, float]
    ) -> Machine:
        """
        Update geometry parameters on an existing machine.

        Validates each supplied parameter against the template schema (min/max),
        merges with existing params, re-expands the URDF, and persists.
        Actuator bindings are preserved unchanged.
        """
        machine = await self.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")

        template_id = machine.description.template_ref.template_id
        tmpl = await self._templates.get_template(template_id)

        # Validate supplied values against template schema
        if tmpl and tmpl.parameters:
            schema = {p["name"]: p for p in tmpl.parameters}
            for name, value in parameters.items():
                if name not in schema:
                    continue  # unknown params are silently ignored
                p = schema[name]
                if "min" in p and value < p["min"]:
                    raise ValueError(
                        f"Parameter '{name}' value {value} is below minimum {p['min']}"
                    )
                if "max" in p and value > p["max"]:
                    raise ValueError(
                        f"Parameter '{name}' value {value} is above maximum {p['max']}"
                    )

        # Merge (allow partial updates)
        updated: dict[str, float | str] = dict(machine.description.parameters)
        updated.update(parameters)
        machine.description.parameters = updated

        # Re-expand URDF
        try:
            machine.expanded_urdf = self._templates.expand(template_id, dict(updated))
        except Exception:
            logger.exception(
                "URDF re-expansion failed after parameter update for machine {}", machine_id
            )

        await self._persist(machine)
        logger.info(
            "Updated parameters for machine {} (keys: {})",
            machine_id,
            list(parameters.keys()),
        )

        # Push updated soft limits to any running sims AND hardware for this machine.
        # Best-effort: failure is logged but does not abort the update.
        bridge = None
        if self._sim_lifecycle is not None:
            bridge = self._sim_lifecycle._sidecar  # type: ignore[attr-defined]
        elif self._hardware_lifecycle is not None:
            bridge = self._hardware_lifecycle._sidecar  # type: ignore[attr-defined]

        if bridge is not None:
            rows: list[dict] = []
            if self._sim_lifecycle is not None:
                rows.extend(await self._repository.sim.list_sims(machine_id))
            if self._hardware_lifecycle is not None:
                rows.extend(await self._repository.hardware.list_hardware(machine_id))
            for row in rows:
                slot = row["slot"]
                actuator_id = row["actuator_id"]
                limit_deg = float(machine.description.parameters.get(f"joint{slot}_limit_deg", 180.0))
                limit_rad = math.radians(limit_deg)
                try:
                    await bridge.set_soft_limits(actuator_id, min_rad=-limit_rad, max_rad=limit_rad)
                except Exception:
                    logger.warning(
                        "Could not update soft limits for actuator {} after parameter update",
                        actuator_id,
                    )

        return machine

