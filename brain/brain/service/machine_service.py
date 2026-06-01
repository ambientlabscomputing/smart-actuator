import math
from typing import TYPE_CHECKING

from brain.models.machine import Machine, MachineDescription, SqlHardwareEntry, SqlSimEntry
from brain.repository.repository import Repository
from brain.service.dh_urdf import dh_chain_to_urdf, dh_values_to_parameters, parameters_to_dh_values
from brain.service.template_service import TemplateService
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.models.machine import DHChainValues, EndEffectorSpec, IKOverrides
    from brain.service.hardware_lifecycle_service import HardwareLifecycleService
    from brain.service.sidecar_bridge import SidecarBridge
    from brain.service.sim_lifecycle_service import SimLifecycleService
    from brain.service.workspace_service import WorkspaceService


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
        workspace: "WorkspaceService | None" = None,
    ) -> None:
        self._repository = repository
        self._templates = template_service
        self._config = config
        self._sim_lifecycle = sim_lifecycle  # injected after construction to break circular dep
        self._hardware_lifecycle = hardware_lifecycle
        self._workspace = workspace

    def set_sim_lifecycle(self, sim_lifecycle: "SimLifecycleService") -> None:
        self._sim_lifecycle = sim_lifecycle

    def set_hardware_lifecycle(self, hardware_lifecycle: "HardwareLifecycleService") -> None:
        self._hardware_lifecycle = hardware_lifecycle

    async def build_machine(self, description: MachineDescription, *, created_by: str) -> Machine:
        """
        Expand the description into a Machine: resolve the template,
        substitute parameters into the URDF skeleton, persist.

        If the template declares a dh: block the canonical DH path is used.
        Otherwise falls back to the Jinja template expansion for legacy templates.
        """
        logger.info(
            "Building machine {} from template {}",
            description.machine_id,
            description.template_ref.template_id,
        )
        template_id = description.template_ref.template_id
        tmpl = await self._templates.get_template(template_id)

        # ── Resolve / seed the DH chain ──────────────────────────────────────
        if tmpl and tmpl.dh:
            dh_schema = tmpl.dh
            easy = tmpl.easy

            if description.dh_chain is not None:
                dh_values = description.dh_chain
            elif description.parameters:
                # Migrate from legacy parameters dict
                dh_values = parameters_to_dh_values(dh_schema, easy, dict(description.parameters))
            else:
                from brain.models.machine import DHChainValues
                dh_values = DHChainValues.from_schema_defaults(dh_schema)

            # Keep dh_chain on description
            description.dh_chain = dh_values
            # Sync derived legacy parameters projection
            description.parameters = dh_values_to_parameters(easy, dh_values)

            # Expand URDF generically from DH chain
            expanded_urdf = ""
            try:
                expanded_urdf = dh_chain_to_urdf(dh_schema, dh_values, robot_name=template_id)
            except Exception:
                logger.exception(
                    "DH URDF expansion failed for template {}; storing empty URDF", template_id
                )
        else:
            # Legacy Jinja path
            expanded_urdf = ""
            try:
                expanded_urdf = self._templates.expand(template_id, dict(description.parameters))
            except Exception:
                logger.exception(
                    "URDF expansion failed for template {}; storing empty URDF", template_id
                )

        # Derive joint names
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

        await self._persist(machine, created_by=created_by)
        logger.info("Machine {} persisted ({} joints)", description.machine_id, len(joint_names))

        # Eager workspace compute
        if self._workspace is not None and machine.description.dh_chain is not None:
            try:
                tmpl_schema = tmpl.dh if tmpl else None
                await self._workspace.compute_for_machine_object(
                    description.machine_id, machine.description.dh_chain, tmpl_schema
                )
            except Exception:
                logger.exception(
                    "Workspace compute failed for machine {} — continuing",
                    description.machine_id,
                )

        return machine

    async def get_machine(self, machine_id: str) -> Machine | None:
        machine = await self._repository.machine.load_machine(machine_id)
        if machine is None:
            return None
        try:
            template_id = machine.description.template_ref.template_id
            tmpl = await self._templates.get_template(template_id)
            machine.joint_names = (
                [j["name"] for j in tmpl.joints]
                if tmpl and tmpl.joints
                else [
                    f"joint{i}" for i in range(max(len(machine.description.actuator_bindings), 1))
                ]
            )

            # Backward-compat migration: seed dh_chain from legacy parameters when absent.
            if tmpl and tmpl.dh and machine.description.dh_chain is None:
                from brain.models.machine import DHChainValues
                if machine.description.parameters:
                    machine.description.dh_chain = parameters_to_dh_values(
                        tmpl.dh, tmpl.easy, dict(machine.description.parameters)
                    )
                else:
                    machine.description.dh_chain = DHChainValues.from_schema_defaults(tmpl.dh)

            return machine
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
        created_by: str,
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
                machine_id,
                slot,
                joint_name=joint_name,
                limit_rad=limit_rad,
                created_by=created_by,
            )

            bindings = list(machine.description.actuator_bindings)
            while len(bindings) <= slot:
                bindings.append("")
            bindings[slot] = actuator_id
            machine.description.actuator_bindings = bindings
            await self._persist(machine, created_by=created_by)

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
                created_by=created_by,
            )

            bindings = list(machine.description.actuator_bindings)
            while len(bindings) <= slot:
                bindings.append("")
            bindings[slot] = bound_actuator_id
            machine.description.actuator_bindings = bindings
            await self._persist(machine, created_by=created_by)

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
            await self._persist(machine, created_by=created_by)

            return {"machine_id": machine_id, "slot": slot, "kind": "unbound"}

        else:
            raise ValueError(f"Unknown binding kind {kind!r}. Valid: 'sim', 'hardware', 'unbound'")

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _persist(self, machine: Machine, *, created_by: str) -> None:
        await self._repository.machine.save_machine(
            machine.description.machine_id,
            {
                "description": machine.description.model_dump(),
                "expanded_urdf": machine.expanded_urdf,
            },
            created_by=created_by,
        )

    async def save_machine(self, machine: Machine, *, created_by: str) -> None:
        await self._persist(machine, created_by=created_by)

    async def set_ik_overrides(
        self, machine_id: str, overrides: "IKOverrides", *, updated_by: str
    ) -> "Machine":
        """Persist IK solver overrides (force-numeric flag, numeric config)."""
        from brain.models.machine import IKOverrides as _IKOverrides  # noqa: F401
        machine = await self.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")
        machine.description.ik_overrides = overrides
        await self._persist(machine, created_by=updated_by)
        logger.info("Updated IK overrides for machine {}", machine_id)
        return machine

    async def set_end_effector(
        self, machine_id: str, ee: "EndEffectorSpec", *, updated_by: str
    ) -> "Machine":
        """Persist a new end-effector frame definition."""
        from brain.models.machine import EndEffectorSpec as _EE  # noqa: F401
        machine = await self.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")
        machine.description.end_effector = ee
        await self._persist(machine, created_by=updated_by)
        logger.info("Updated end-effector for machine {}", machine_id)
        return machine

    async def expand_urdf(self, description: MachineDescription) -> str:
        try:
            return self._templates.expand(
                description.template_ref.template_id, dict(description.parameters)
            )
        except Exception:
            logger.exception("expand_urdf failed")
            return ""

    async def bind_actuators(
        self, machine_id: str, actuator_ids: list[str], *, created_by: str
    ) -> None:
        """Legacy: bind a complete ordered list of actuator IDs to the machine."""
        machine = await self.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")
        machine.description.actuator_bindings = actuator_ids
        await self._persist(machine, created_by=created_by)
        logger.info("Bound actuators to machine {}", machine_id)

    async def update_parameters(
        self,
        machine_id: str,
        parameters: dict[str, float] | None = None,
        *,
        dh_chain: "DHChainValues | None" = None,
        created_by: str,
    ) -> Machine:
        """
        Update an existing machine's kinematics.

        Accepts either a dh_chain (new canonical form) or a legacy parameters
        dict (or both).  When dh_chain is supplied it becomes the source of
        truth and the legacy parameters projection is re-derived.  When only
        parameters are supplied they are applied via the easy aliases onto the
        existing dh_chain (or legacy path if the template has no dh: block).
        """
        from brain.models.machine import DHChainValues  # local to avoid circular at module level

        machine = await self.get_machine(machine_id)
        if machine is None:
            raise ValueError(f"Machine {machine_id!r} not found")

        template_id = machine.description.template_ref.template_id
        tmpl = await self._templates.get_template(template_id)

        if tmpl and tmpl.dh:
            dh_schema = tmpl.dh
            easy = tmpl.easy

            # Determine canonical DH values to use
            if dh_chain is not None:
                new_dh = dh_chain
            elif machine.description.dh_chain is not None:
                new_dh = machine.description.dh_chain
            elif machine.description.parameters:
                new_dh = parameters_to_dh_values(
                    dh_schema, easy, dict(machine.description.parameters)
                )
            else:
                new_dh = DHChainValues.from_schema_defaults(dh_schema)

            # Apply any legacy parameters on top via easy aliases
            if parameters:
                for alias in easy:
                    if alias.legacy_param in parameters:
                        new_dh.apply_easy_alias(alias.target, parameters[alias.legacy_param])

            machine.description.dh_chain = new_dh
            machine.description.parameters = dh_values_to_parameters(easy, new_dh)

            try:
                machine.expanded_urdf = dh_chain_to_urdf(
                    dh_schema, new_dh, robot_name=template_id
                )
            except Exception:
                logger.exception(
                    "DH URDF re-expansion failed for machine {}", machine_id
                )
        else:
            # Legacy path: validate + merge parameters
            if parameters is None:
                parameters = {}
            if tmpl and tmpl.parameters:
                schema = {p["name"]: p for p in tmpl.parameters}
                for name, value in parameters.items():
                    if name not in schema:
                        continue
                    p = schema[name]
                    if "min" in p and value < p["min"]:
                        raise ValueError(
                            f"Parameter '{name}' value {value} is below minimum {p['min']}"
                        )
                    if "max" in p and value > p["max"]:
                        raise ValueError(
                            f"Parameter '{name}' value {value} is above maximum {p['max']}"
                        )
            updated: dict[str, float | str] = dict(machine.description.parameters)
            updated.update(parameters)
            machine.description.parameters = updated
            try:
                machine.expanded_urdf = self._templates.expand(template_id, dict(updated))
            except Exception:
                logger.exception(
                    "URDF re-expansion failed after parameter update for machine {}", machine_id
                )

        await self._persist(machine, created_by=created_by)
        logger.info("Updated kinematics for machine {}", machine_id)

        # Eager workspace recompute
        if self._workspace is not None and machine.description.dh_chain is not None:
            try:
                tmpl_schema2 = tmpl.dh if tmpl else None
                await self._workspace.compute_for_machine_object(
                    machine_id, machine.description.dh_chain, tmpl_schema2
                )
            except Exception:
                logger.exception(
                    "Workspace recompute failed for machine {} after update — continuing",
                    machine_id,
                )

        # Push updated soft limits to any running sims / hardware.
        bridge: "SidecarBridge | None" = None
        if self._sim_lifecycle is not None:
            bridge = self._sim_lifecycle._sidecar  # type: ignore[attr-defined]
        elif self._hardware_lifecycle is not None:
            bridge = self._hardware_lifecycle._sidecar  # type: ignore[attr-defined]

        if bridge is not None:
            rows: list[SqlSimEntry | SqlHardwareEntry] = []
            if self._sim_lifecycle is not None:
                rows.extend(await self._repository.sim.list_sims(machine_id))
            if self._hardware_lifecycle is not None:
                rows.extend(await self._repository.hardware.list_hardware(machine_id))
            for row in rows:
                slot = row.slot
                actuator_id = row.actuator_id
                limit_deg = float(
                    machine.description.parameters.get(f"joint{slot}_limit_deg", 180.0)
                )
                limit_rad = math.radians(limit_deg)
                try:
                    await bridge.set_soft_limits(actuator_id, min_rad=-limit_rad, max_rad=limit_rad)
                except Exception:
                    logger.warning(
                        "Could not update soft limits for actuator {} after update",
                        actuator_id,
                    )

        return machine
