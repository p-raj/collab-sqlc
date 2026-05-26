"""Driver factory — creates the right driver based on connection type."""

from src.connections.drivers.base import DatabaseDriver
from src.connections.engine_registry import (
    SUPPORTED_DATABASE_ENGINE_IDS,
    get_database_engine,
)


def create_driver(db_type: str) -> DatabaseDriver:
    return get_database_engine(db_type).create_driver()


def supported_types() -> list[str]:
    return list(SUPPORTED_DATABASE_ENGINE_IDS)
