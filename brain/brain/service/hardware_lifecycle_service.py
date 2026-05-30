"""
HardwareLifecycleService — Brain-side manager for real hardware actuators.

Mirrors the structure of SimLifecycleService without the subprocess layer.

Responsibilities:
  - Accept a hardware endpoint (ip, port) and derive or accept an actuator_id.
  - Register the endpoint with the Sidecar via RegisterPeer (is_simulated=False).
  - Persist to hardware_registry SQLite table.
  - On Brain startup: read hardware_registry and re-register all known hardware
    endpoints with the Sidecar (no respawn needed — hardware is already running).
  - On teardown: deregister from Sidecar and delete registry row.
"""

import math
from typing import TYPE_CHECKING

from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.service.observability_service import ObservabilityService
    from brain.service.sidecar_bridge import SidecarBridge


class HardwareLifecycleService:
    def __init__(
        self,
        repository: Repository,
        config: Config,
        *,
        sidecar_bridge: "SidecarBridge",
        observability: "ObservabilityService",
    ) -> None:
        self._repo = repository
        self._config = config
        self._sidecar: SidecarBridge = sidecar_bridge  # type: ignore[assignment]
        self._obs: ObservabilityService = observability  # type: ignore[assignment]

    # ------------------------------------------------------------------
    # Startup recovery — re-register known hardware with Sidecar
    # ------------------------------------------------------------------

    async def recover_on_start(self) -> None:
        rows = await self._repo.hardware.list_all_hardware()
        if not rows:
            logger.info("HardwareLifecycle: no hardware endpoints to recover")
            return

        logger.info("HardwareLifecycle: recovering {} hardware endpoint(s)", len(rows))
        for row in rows:
            machine_id = row["machine_id"]
            slot = row["slot"]
            actuator_id = row["actuator_id"]
            address = row["address"]
            joint_name = row["joint_name"]

            try:
                await self._sidecar.register_peer(  # type: ignore[attr-defined]
                    actuator_id=actuator_id,
                    address=address,
                    joint_name=joint_name,
                    is_simulated=False,
                )
                self._sidecar.track_machine_actuator(  # type: ignore[attr-defined]
                    actuator_id, machine_id
                )
                limit_rad = await self._get_joint_limit_rad(machine_id, slot)
                await self._sidecar.set_soft_limits(  # type: ignore[attr-defined]
                    actuator_id, min_rad=-limit_rad, max_rad=limit_rad
                )
                logger.info(
                    "HardwareLifecycle: recovered machine={} slot={} address={} id={}",
                    machine_id,
                    slot,
                    address,
                    actuator_id,
                )
            except Exception:
                logger.exception(
                    "HardwareLifecycle: failed to recover machine={} slot={}", machine_id, slot
                )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def bind_hardware(
        self,
        machine_id: str,
        slot: int,
        *,
        joint_name: str,
        ip: str | None = None,
        port: int | None = None,
        serial_path: str | None = None,
        baud_rate: int = 921_600,
        actuator_id: str | None = None,
        limit_rad: float = math.pi,
        created_by: str,
    ) -> tuple[str, str]:
        """
        Register a real hardware actuator with the Sidecar and persist.

        Supply either ``ip`` + ``port`` (TCP) or ``serial_path`` (USB-CDC).
        Returns (address, actuator_id).
        Raises RuntimeError if Sidecar registration fails.
        """
        if serial_path:
            address = f"serial://{serial_path}?baud={baud_rate}"
        elif ip and port:
            address = f"http://{ip}:{port}"
        else:
            raise ValueError("bind_hardware requires ip+port (TCP) or serial_path (USB-CDC)")
        if not actuator_id:
            actuator_id = f"hw-{machine_id}-slot{slot}"

        # Tear down any existing binding on this slot first (idempotent).
        await self.teardown_hardware(machine_id, slot)

        result = await self._sidecar.register_peer(  # type: ignore[attr-defined]
            actuator_id=actuator_id,
            address=address,
            joint_name=joint_name,
            is_simulated=False,
        )
        if not result.get("success"):
            raise RuntimeError(
                f"Sidecar rejected hardware registration for {actuator_id} at {address}: "
                f"{result.get('message', 'unknown error')}"
            )

        self._sidecar.track_machine_actuator(  # type: ignore[attr-defined]
            actuator_id, machine_id
        )
        await self._sidecar.set_soft_limits(  # type: ignore[attr-defined]
            actuator_id, min_rad=-limit_rad, max_rad=limit_rad
        )

        await self._repo.hardware.save_hardware(
            machine_id,
            slot,
            address=address,
            actuator_id=actuator_id,
            joint_name=joint_name,
            created_by=created_by,
        )

        self._obs._publish_event(  # type: ignore[attr-defined]
            {
                "type": "hardware.bound",
                "machine_id": machine_id,
                "slot": slot,
                "actuator_id": actuator_id,
                "address": address,
            }
        )
        logger.info(
            "HardwareLifecycle: bound machine={} slot={} address={} id={}",
            machine_id,
            slot,
            address,
            actuator_id,
        )
        return address, actuator_id

    async def teardown_hardware(self, machine_id: str, slot: int) -> None:
        """
        Deregister a hardware actuator from the Sidecar and remove from registry.
        Safe to call when no hardware is bound to this slot.
        """
        rows = await self._repo.hardware.list_hardware(machine_id)
        row = next((r for r in rows if r["slot"] == slot), None)
        if row is None:
            return

        actuator_id = row["actuator_id"]
        try:
            await self._sidecar.deregister_peer(actuator_id=actuator_id)  # type: ignore[attr-defined]
        except Exception:
            logger.warning(
                "HardwareLifecycle: deregister_peer failed for {} — ignoring", actuator_id
            )
        self._sidecar.untrack_actuator(actuator_id)  # type: ignore[attr-defined]
        await self._repo.hardware.delete_hardware(machine_id, slot)

        logger.info(
            "HardwareLifecycle: unbound machine={} slot={} id={}", machine_id, slot, actuator_id
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_joint_limit_rad(self, machine_id: str, slot: int) -> float:
        row = await self._repo.machine.load_machine(machine_id)
        if row is None:
            return math.pi
        try:
            params = row["description"].get("parameters", {})
            return math.radians(float(params.get(f"joint{slot}_limit_deg", 180.0)))
        except Exception:
            return math.pi
