"""Unit tests for the backend engine registry."""

from src.connections.drivers.clickhouse import ClickHouseDriver
from src.connections.drivers.postgres import PostgresDriver
from src.connections.engine_registry import (
    SUPPORTED_DATABASE_ENGINE_IDS,
    get_database_engine,
    get_database_engine_or_default,
)


def test_supported_engine_ids_are_stable() -> None:
    assert SUPPORTED_DATABASE_ENGINE_IDS == ("postgresql", "clickhouse")


def test_get_database_engine_returns_postgresql_capabilities() -> None:
    engine = get_database_engine("postgresql")

    assert engine.label == "PostgreSQL"
    assert engine.default_port == 5432
    assert engine.sqlglot_dialect == "postgres"
    assert engine.supports_explain is True
    assert engine.supports_cancel is True
    assert engine.capabilities.explain is True
    assert engine.capabilities.cancel is True
    assert engine.capabilities.streaming is True
    assert engine.explain.output_kind == "json"
    assert engine.explain.wraps_in_rollback is True
    assert engine.parameter_binding.placeholder_style == "dollar_indexed"
    assert engine.driver_errors.module_markers == ()
    assert isinstance(engine.create_driver(), PostgresDriver)


def test_get_database_engine_returns_clickhouse_capabilities() -> None:
    engine = get_database_engine("clickhouse")

    assert engine.label == "ClickHouse"
    assert engine.default_port == 8123
    assert engine.sqlglot_dialect == "clickhouse"
    assert engine.supports_explain is True
    assert engine.supports_cancel is False
    assert engine.supports_streaming is False
    assert engine.capabilities.explain is True
    assert engine.capabilities.cancel is False
    assert engine.capabilities.streaming is False
    assert engine.explain.prefix == "EXPLAIN PLAN"
    assert engine.explain.wraps_in_rollback is False
    assert engine.explain.output_kind == "text"
    assert engine.parameter_binding.placeholder_style == "pyformat_named"
    assert engine.driver_errors.module_markers == ("clickhouse",)
    assert isinstance(engine.create_driver(), ClickHouseDriver)


def test_get_database_engine_or_default_falls_back_to_postgresql() -> None:
    assert get_database_engine_or_default().id == "postgresql"
    assert get_database_engine_or_default(None).id == "postgresql"
