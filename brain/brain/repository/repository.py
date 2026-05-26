class Repository:
    """
    SQLite-backed persistence layer.

    Owns a single database file (brain.db by default).  All mutable Brain
    state that must survive restarts lives here:
      - machine descriptions (template_ref + parameters + actuator_bindings)
      - calibration data per machine
      - program library
      - mode-event history
      - user accounts and API tokens (post-v1 auth)

    The expanded URDF and bind-time caches are stored alongside the
    description as derived artefacts; the description tuple is the source
    of truth and is what gets committed and restored on restart.
    """

    def __init__(self, db_path: str = "brain.db") -> None:
        self._db_path = db_path
        # TODO: open aiosqlite connection, run migrations

    # ------------------------------------------------------------------
    # Machine descriptions
    # ------------------------------------------------------------------

    async def save_machine(self, machine_id: str, data: dict) -> None:
        # TODO: upsert into machines table
        pass

    async def load_machine(self, machine_id: str) -> dict | None:
        # TODO: query machines table
        return None

    async def list_machines(self) -> list[str]:
        # TODO: query machines table for all machine_ids
        return []

    async def delete_machine(self, machine_id: str) -> None:
        # TODO: delete from machines table
        pass

    # ------------------------------------------------------------------
    # Calibration data
    # ------------------------------------------------------------------

    async def save_calibration(self, machine_id: str, data: dict) -> None:
        # TODO: upsert into calibrations table
        pass

    async def load_calibration(self, machine_id: str) -> dict | None:
        # TODO: query calibrations table
        return None

    # ------------------------------------------------------------------
    # Program library
    # ------------------------------------------------------------------

    async def save_program(self, program_id: str, data: dict) -> None:
        # TODO: upsert into programs table
        pass

    async def load_program(self, program_id: str) -> dict | None:
        # TODO: query programs table
        return None

    async def list_programs(self) -> list[dict]:
        # TODO: query programs table (metadata only)
        return []

    async def delete_program(self, program_id: str) -> None:
        # TODO: delete from programs table
        pass

    # ------------------------------------------------------------------
    # Mode event history
    # ------------------------------------------------------------------

    async def append_mode_event(self, event: dict) -> None:
        # TODO: insert into mode_events table
        pass

    async def get_mode_events(self, machine_id: str, limit: int = 100) -> list[dict]:
        # TODO: query mode_events table ordered by timestamp desc
        return []
