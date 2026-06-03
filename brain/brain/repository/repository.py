from brain.models.base import SqlBase
from brain.repository.calibration_repository import CalibrationRepository
from brain.repository.file_repository import FileRepository
from brain.repository.hardware_repository import HardwareRepository
from brain.repository.machine_repository import MachineRepository
from brain.repository.mode_event_repository import ModeEventRepository
from brain.repository.program_repository import ProgramRepository
from brain.repository.session_maker import get_engine
from brain.repository.sim_repository import SimRepository
from brain.repository.user_repository import UserRepository
from brain.utils.logger import logger


class Repository:
    """
    SQLite-backed persistence layer.

    Owns a single database file (brain.db by default)
    """

    def __init__(self) -> None:
        self.machine = MachineRepository()
        self.sim = SimRepository()
        self.hardware = HardwareRepository()
        self.calibration = CalibrationRepository()
        self.program = ProgramRepository()
        self.mode_event = ModeEventRepository()
        self.user = UserRepository()
        self.files = FileRepository()

    async def start(self) -> None:
        """Open the database, run migrations, and initialise sub-repositories."""

        async with get_engine().begin() as conn:
            await conn.run_sync(SqlBase.metadata.create_all)
        logger.info("Repository opened")

    async def stop(self) -> None:
        pass
