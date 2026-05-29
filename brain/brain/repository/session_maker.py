from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from brain import Config

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def init_session_maker(cfg: Config) -> None:
    global _engine, _sessionmaker
    _engine = create_async_engine(cfg.db.url, echo=True)
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)


def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("Session maker not initialized. Call init_session_maker() first.")
    return _engine


def get_session() -> AsyncSession:
    if _sessionmaker is None:
        raise RuntimeError("Session maker not initialized. Call init_session_maker() first.")
    return _sessionmaker()
