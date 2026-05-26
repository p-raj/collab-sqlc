"""Static registry of supported database engines."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Final, Literal

from src.connections.drivers.clickhouse import ClickHouseDriver
from src.connections.drivers.postgres import PostgresDriver
from src.shared.dialect.clickhouse import ClickHouseDialect
from src.shared.dialect.postgres import PostgresDialect

if TYPE_CHECKING:
    from src.connections.drivers.base import DatabaseDriver
    from src.shared.dialect.base import DialectProfile


@dataclass(frozen=True, slots=True)
class EngineCapabilities:
    explain: bool
    cancel: bool
    streaming: bool


@dataclass(frozen=True, slots=True)
class ExplainProfile:
    prefix: str
    wraps_in_rollback: bool
    output_kind: Literal["json", "text"]


@dataclass(frozen=True, slots=True)
class ParameterBindingProfile:
    placeholder_style: Literal["dollar_indexed", "pyformat_named"]


@dataclass(frozen=True, slots=True)
class DriverErrorProfile:
    module_markers: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class EnginePlugin:
    """Static engine plugin contract.

    Core services own platform policy: roles, safe mode, write-mode, logging,
    and audit. Engine plugins describe database-specific mechanisms: driver,
    dialect, capabilities, EXPLAIN shape, and driver error markers.
    """

    id: str
    label: str
    default_port: int
    sqlglot_dialect: str
    driver_factory: type[DatabaseDriver]
    dialect: DialectProfile
    capabilities: EngineCapabilities
    explain: ExplainProfile
    parameter_binding: ParameterBindingProfile
    driver_errors: DriverErrorProfile

    def create_driver(self) -> DatabaseDriver:
        return self.driver_factory()

    @property
    def supports_explain(self) -> bool:
        return self.capabilities.explain

    @property
    def supports_cancel(self) -> bool:
        return self.capabilities.cancel

    @property
    def supports_streaming(self) -> bool:
        return self.capabilities.streaming


DatabaseEngine = EnginePlugin


_POSTGRES_DIALECT = PostgresDialect()
_CLICKHOUSE_DIALECT = ClickHouseDialect()

DATABASE_ENGINES: Final[dict[str, EnginePlugin]] = {
    "postgresql": EnginePlugin(
        id="postgresql",
        label="PostgreSQL",
        default_port=5432,
        sqlglot_dialect="postgres",
        driver_factory=PostgresDriver,
        dialect=_POSTGRES_DIALECT,
        capabilities=EngineCapabilities(
            explain=True,
            cancel=True,
            streaming=True,
        ),
        explain=ExplainProfile(
            prefix="EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON)",
            wraps_in_rollback=True,
            output_kind="json",
        ),
        parameter_binding=ParameterBindingProfile(placeholder_style="dollar_indexed"),
        driver_errors=DriverErrorProfile(),
    ),
    "clickhouse": EnginePlugin(
        id="clickhouse",
        label="ClickHouse",
        default_port=8123,
        sqlglot_dialect="clickhouse",
        driver_factory=ClickHouseDriver,
        dialect=_CLICKHOUSE_DIALECT,
        capabilities=EngineCapabilities(
            explain=True,
            cancel=False,
            streaming=False,
        ),
        explain=ExplainProfile(
            prefix="EXPLAIN PLAN",
            wraps_in_rollback=False,
            output_kind="text",
        ),
        parameter_binding=ParameterBindingProfile(placeholder_style="pyformat_named"),
        driver_errors=DriverErrorProfile(module_markers=("clickhouse",)),
    ),
}

DEFAULT_DATABASE_ENGINE_ID = "postgresql"
SUPPORTED_DATABASE_ENGINE_IDS: Final[tuple[str, ...]] = tuple(DATABASE_ENGINES.keys())
SUPPORTED_DATABASE_ENGINE_PATTERN: Final[str] = (
    r"^(" + "|".join(SUPPORTED_DATABASE_ENGINE_IDS) + r")$"
)


def get_database_engine(db_type: str) -> EnginePlugin:
    engine = DATABASE_ENGINES.get(db_type)
    if engine is None:
        supported = ", ".join(SUPPORTED_DATABASE_ENGINE_IDS)
        raise ValueError(f"Unsupported database type: {db_type}. Supported: {supported}")
    return engine


def get_database_engine_or_default(db_type: str | None = None) -> EnginePlugin:
    return DATABASE_ENGINES.get(
        db_type or DEFAULT_DATABASE_ENGINE_ID,
        DATABASE_ENGINES[DEFAULT_DATABASE_ENGINE_ID],
    )


def is_engine_driver_error(exc: Exception) -> bool:
    module = type(exc).__module__.lower()
    return any(
        marker in module
        for engine in DATABASE_ENGINES.values()
        for marker in engine.driver_errors.module_markers
    )
