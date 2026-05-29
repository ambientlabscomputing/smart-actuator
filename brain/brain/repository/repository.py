import aiosqlite

from brain.utils.logger import logger
from brain.repository.migrator import Migrator
from brain.repository.machine_repository import MachineRepository
from brain.repository.sim_repository import SimRepository
from brain.repository.hardware_repository import HardwareRepository
from brain.repository.calibration_repository import CalibrationRepository
from brain.repository.program_repository import ProgramRepository
from brain.repository.mode_event_repository import ModeEventRepository


class Repository:
    """
    SQLite-backed persistence layer.

    Owns a single database file (brain.db by default).  Domain-specific
    operations are delegated to sub-repositories accessible as attributes:

      repository.machine      — MachineRepository
      repository.sim          — SimRepository
      repository.calibration  — CalibrationRepository
      repository.program      — ProgramRepository (programs + runs)
      repository.mode_event   — ModeEventRepository
    """

    def __init__(self, db_path: str = "brain.db") -> None:
        self._db_path = db_path
        self._db: aiosqlite.Connection | None = None

    async def start(self) -> None:
        """Open the database, run migrations, and initialise sub-repositories."""
        self._db = await aiosqlite.connect(self._db_path)
        await Migrator(self._db).migrate()
        self.machine = MachineRepository(self._db)
        self.sim = SimRepository(self._db)
        self.hardware = HardwareRepository(self._db)
        self.calibration = CalibrationRepository(self._db)
        self.program = ProgramRepository(self._db)
        self.mode_event = ModeEventRepository(self._db)
        logger.info("Repository opened at {}", self._db_path)

    async def stop(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None
