from brain.repository.migrations import m_001_init
import aiosqlite
from typing import Awaitable, Callable

Migration = Callable[[aiosqlite.Connection], Awaitable[None]]

migrations = [
    m_001_init.migrate,
]

class Migrator:
    def __init__(self, conn: aiosqlite.Connection):
        self.conn = conn
        self.migrations: list[Migration] = migrations

    async def migrate(self) -> None:
        for migration in self.migrations:
            await migration(self.conn)
