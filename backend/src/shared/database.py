import json
from collections.abc import AsyncGenerator
from typing import Any

from pydantic_core import to_jsonable_python
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.shared.config import AppSettings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def json_serializer(value: Any) -> str:
    return json.dumps(to_jsonable_python(value))


def init_engine(settings: AppSettings) -> AsyncEngine:
    global _engine, _session_factory

    _engine = create_async_engine(
        settings.db.url,
        json_serializer=json_serializer,
        pool_size=settings.db.pool_size,
        max_overflow=settings.db.max_overflow,
        pool_timeout=settings.db.pool_timeout,
        echo=settings.debug,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("Database engine not initialized. Call init_engine() first.")
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Expose session factory for CLI scripts and background tasks."""
    if _session_factory is None:
        raise RuntimeError("Database engine not initialized. Call init_engine() first.")
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if _session_factory is None:
        raise RuntimeError("Database engine not initialized. Call init_engine() first.")

    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def close_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
