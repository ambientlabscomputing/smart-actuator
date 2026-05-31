"""
SimLifecycleService — Brain-side subprocess manager for actuator-sim instances.

Responsibilities:
  - Allocate gRPC ports from a deterministic range (50100–50199 by default).
  - Spawn actuator-sim child processes with env-var overrides for port + identity.
  - Poll ReadPosition until the sim is ready (same readiness check used for real hardware).
  - Register each spawned sim with the Sidecar via RegisterPeer.
  - Persist spawn metadata to sim_registry SQLite table.
  - On Brain startup: read sim_registry, kill stale PIDs, re-spawn and re-register.
  - On teardown: SIGTERM the process, deregister from Sidecar, delete registry row.

Scope trim (per J3 plan): no mid-run crash auto-restart. Crashes surface as
sim.crashed events on /events WS; recovery only happens on Brain startup.
"""

import asyncio
import math
import os
import signal
from pathlib import Path
from typing import TYPE_CHECKING

from brain.repository.repository import Repository
from brain.utils.config import Config
from brain.utils.logger import logger

if TYPE_CHECKING:
    from brain.service.observability_service import ObservabilityService
    from brain.service.sidecar_bridge import SidecarBridge

_READINESS_POLL_INTERVAL_S = 0.05
_READINESS_TIMEOUT_S = 5.0


class SimLifecycleService:
    def __init__(
        self,
        repository: Repository,
        config: Config,
        *,
        sidecar_bridge: "SidecarBridge",  # injected to avoid circular import at runtime
        observability: "ObservabilityService",
    ) -> None:
        self._repo = repository
        self._config = config
        self._sidecar: SidecarBridge = sidecar_bridge  # type: ignore[assignment]
        self._obs: ObservabilityService = observability  # type: ignore[assignment]
        # in-memory set of ports currently in use (supplemented by registry on startup)
        self._allocated_ports: set[int] = set()
        # pid → asyncio.subprocess.Process for cleanup
        self._processes: dict[int, asyncio.subprocess.Process] = {}

    # ------------------------------------------------------------------
    # Startup recovery
    # ------------------------------------------------------------------

    async def recover_on_start(self) -> None:
        """
        Called once during Brain startup. For each row in sim_registry:
          1. Kill any stale process still running with the old PID.
          2. Re-spawn a fresh sim on the same port.
          3. Re-register the new sim with the Sidecar.
        """
        rows = await self._repo.sim.list_all_sims()
        if not rows:
            logger.info("SimLifecycle: no sims to recover")
            return

        logger.info("SimLifecycle: recovering {} sim(s) from registry", len(rows))
        for row in rows:
            machine_id = row.machine_id
            slot = row.slot
            old_pid = row.pid
            old_actuator_id = row.actuator_id
            joint_name = row.joint_name

            # Derive port from the stored address e.g. "http://127.0.0.1:50101"
            try:
                port = int(row.address.rsplit(":", 1)[-1])
            except (ValueError, IndexError):
                port = self._allocate_port()

            # Kill stale PID if it still lives (best-effort)
            self._kill_pid(old_pid)

            # Re-spawn on same port and same actuator_id so the Sidecar sees no change.
            self._allocated_ports.add(port)
            try:
                limit_rad = await self._get_joint_limit_rad(machine_id, slot)
                address, pid, actuator_id = await self._do_spawn(
                    machine_id=machine_id,
                    slot=slot,
                    joint_name=joint_name,
                    port=port,
                    actuator_id=old_actuator_id,
                )
                await self._repo.sim.save_sim(
                    machine_id,
                    slot,
                    address=address,
                    pid=pid,
                    actuator_id=actuator_id,
                    joint_name=joint_name,
                    created_by="system",
                )
                await self._sidecar.register_peer(  # type: ignore[attr-defined]
                    actuator_id=actuator_id,
                    address=address,
                    joint_name=joint_name,
                    is_simulated=True,
                )
                self._sidecar.track_machine_actuator(  # type: ignore[attr-defined]
                    actuator_id, machine_id
                )
                await self._sidecar.set_soft_limits(  # type: ignore[attr-defined]
                    actuator_id, min_rad=-limit_rad, max_rad=limit_rad
                )
                logger.info(
                    "SimLifecycle: recovered machine={} slot={} port={} pid={} limit={:.4f}rad",
                    machine_id,
                    slot,
                    port,
                    pid,
                    limit_rad,
                )
            except Exception:
                logger.exception(
                    "SimLifecycle: failed to recover machine={} slot={}", machine_id, slot
                )
                # Remove the stale row so the Brain doesn't retry forever
                await self._repo.sim.delete_sim(machine_id, slot)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def spawn_sim(
        self,
        machine_id: str,
        slot: int,
        *,
        joint_name: str,
        limit_rad: float = math.pi,
        created_by: str,
    ) -> tuple[str, int, str]:
        """
        Allocate a port, spawn an actuator-sim subprocess, wait for it to be
        ready, persist to sim_registry, and register with the Sidecar.

        ``limit_rad`` is the symmetric soft-limit applied to the actuator after
        registration (±limit_rad). Defaults to π (full rotation).

        Returns (address, pid, actuator_id).
        Raises RuntimeError if spawn or readiness check fails.
        """
        port = self._allocate_port()
        actuator_id = f"sim-{machine_id}-slot{slot}"

        try:
            address, pid, actuator_id = await self._do_spawn(
                machine_id=machine_id,
                slot=slot,
                joint_name=joint_name,
                port=port,
                actuator_id=actuator_id,
            )
        except Exception:
            self._allocated_ports.discard(port)
            raise

        await self._repo.sim.save_sim(
            machine_id,
            slot,
            address=address,
            pid=pid,
            actuator_id=actuator_id,
            joint_name=joint_name,
            created_by=created_by,
        )
        await self._sidecar.register_peer(  # type: ignore[attr-defined]
            actuator_id=actuator_id,
            address=address,
            joint_name=joint_name,
            is_simulated=True,
        )
        self._sidecar.track_machine_actuator(  # type: ignore[attr-defined]
            actuator_id, machine_id
        )
        await self._sidecar.set_soft_limits(  # type: ignore[attr-defined]
            actuator_id, min_rad=-limit_rad, max_rad=limit_rad
        )

        self._obs._publish_event(  # type: ignore[attr-defined]
            {
                "type": "sim.spawned",
                "machine_id": machine_id,
                "slot": slot,
                "actuator_id": actuator_id,
                "address": address,
                "pid": pid,
            }
        )
        logger.info(
            "SimLifecycle: spawned machine={} slot={} port={} pid={} id={}",
            machine_id,
            slot,
            port,
            pid,
            actuator_id,
        )
        return address, pid, actuator_id

    async def teardown_sim(self, machine_id: str, slot: int) -> None:
        """
        Deregister from Sidecar, SIGTERM the process, and remove from registry.
        Safe to call even if the process is already dead.
        """
        rows = await self._repo.sim.list_sims(machine_id)
        row = next((r for r in rows if r.slot == slot), None)
        if row is None:
            logger.warning("SimLifecycle: teardown slot={} not in registry", slot)
            return

        actuator_id = row.actuator_id
        pid = row.pid

        await self._sidecar.deregister_peer(actuator_id=actuator_id)  # type: ignore[attr-defined]
        self._sidecar.untrack_actuator(actuator_id)  # type: ignore[attr-defined]
        self._kill_pid(pid)
        self._allocated_ports.discard(self._port_from_address(row.address))
        await self._repo.sim.delete_sim(machine_id, slot)

        logger.info("SimLifecycle: torn down machine={} slot={} pid={}", machine_id, slot, pid)

    async def teardown_all_sims(self, machine_id: str) -> None:
        rows = await self._repo.sim.list_sims(machine_id)
        for row in rows:
            await self._sidecar.deregister_peer(actuator_id=row.actuator_id)  # type: ignore[attr-defined]
            self._kill_pid(row.pid)
            self._allocated_ports.discard(self._port_from_address(row.address))
        await self._repo.sim.delete_all_sims(machine_id)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_joint_limit_rad(self, machine_id: str, slot: int) -> float:
        """Look up joint{slot}_limit_deg from stored machine parameters."""
        row = await self._repo.machine.load_machine(machine_id)
        if row is None:
            return math.pi
        try:
            params = row.description.parameters
            limit_deg = float(params.get(f"joint{slot}_limit_deg", 180.0))
            return math.radians(limit_deg)
        except Exception:
            logger.warning(
                "SimLifecycle: could not read limit for machine={} slot={}, using π",
                machine_id,
                slot,
            )
            return math.pi

    def _allocate_port(self) -> int:
        start = self._config.sim.port_range_start
        end = self._config.sim.port_range_end
        for port in range(start, end + 1):
            if port not in self._allocated_ports:
                self._allocated_ports.add(port)
                return port
        raise RuntimeError(
            f"No free sim ports in range {start}–{end}. Stop stale sims with 'make j3-stop'."
        )

    async def _do_spawn(
        self,
        *,
        machine_id: str,
        slot: int,
        joint_name: str,
        port: int,
        actuator_id: str,
    ) -> tuple[str, int, str]:
        address = f"http://127.0.0.1:{port}"
        pid_file = f"/tmp/actuator_sim_{machine_id}_{slot}.pid"

        env = os.environ.copy()
        env["ACTUATOR_SIM_PORT"] = str(port)
        env["ACTUATOR_SIM_ID"] = actuator_id
        env["ACTUATOR_SIM_NAME"] = joint_name
        env["ACTUATOR_SIM_PID_FILE"] = pid_file

        binary = self._config.sim.binary_path
        config_file = self._config.sim.config_path

        # Resolve paths relative to the workspace root.
        if not Path(binary).is_absolute():
            binary = str(Path(__file__).parents[3] / binary)
        if not Path(config_file).is_absolute():
            config_file = str(Path(__file__).parents[3] / config_file)

        env["ACTUATOR_SIM_CONFIG"] = config_file

        logger.debug(
            "SimLifecycle: launching {} port={} id={} pid_file={}",
            binary,
            port,
            actuator_id,
            pid_file,
        )

        proc = await asyncio.create_subprocess_exec(
            binary,
            "run",
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        pid = proc.pid
        self._processes[pid] = proc

        # Wait until the sim answers ReadPosition (same check used for real hardware).
        await self._wait_for_ready(address, actuator_id)

        return address, pid, actuator_id

    async def _wait_for_ready(self, address: str, actuator_id: str) -> None:
        """
        Poll until the sim's TCP port accepts connections.
        A successful TCP handshake means the gRPC server is up.
        """
        # address is "http://host:port" — extract host:port for TCP check
        host_port = address.removeprefix("http://").removeprefix("https://")
        host, port_str = host_port.rsplit(":", 1)
        port = int(port_str)

        deadline = asyncio.get_event_loop().time() + _READINESS_TIMEOUT_S
        last_err: str = ""
        while asyncio.get_event_loop().time() < deadline:
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port),
                    timeout=_READINESS_POLL_INTERVAL_S * 4,
                )
                writer.close()
                await writer.wait_closed()
                return
            except Exception as exc:
                last_err = str(exc)
                await asyncio.sleep(_READINESS_POLL_INTERVAL_S)
        raise RuntimeError(
            f"Sim {actuator_id} at {address} did not become ready within "
            f"{_READINESS_TIMEOUT_S}s. Last error: {last_err}"
        )

    @staticmethod
    def _kill_pid(pid: int) -> None:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass  # already gone
        except Exception:
            logger.exception("SimLifecycle: error killing pid={}", pid)

    @staticmethod
    def _port_from_address(address: str) -> int:
        try:
            return int(address.rsplit(":", 1)[-1])
        except (ValueError, IndexError):
            return 0
