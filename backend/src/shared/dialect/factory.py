"""Dialect factory — returns the dialect profile for a given db_type."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.connections.engine_registry import get_database_engine_or_default

if TYPE_CHECKING:
    from src.shared.dialect.base import DialectProfile


def get_dialect(db_type: str | None = None) -> DialectProfile:
    """Return the dialect profile for the given db_type, defaulting to PostgreSQL."""
    return get_database_engine_or_default(db_type).dialect
