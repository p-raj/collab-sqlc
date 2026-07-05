"""Database driver protocol — the pluggable interface for all target databases."""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class ConnectionConfig:
    host: str
    port: int
    database: str
    username: str
    password: str
    ssl_enabled: bool = False
    ssl_ca: str | None = None
    ssl_cert: str | None = None
    ssl_key: str | None = None
    config: dict[str, Any] | None = None
    credentials: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class ColumnInfo:
    name: str
    data_type: str
    is_nullable: bool = True
    is_primary_key: bool = False
    default_value: str | None = None
    comment: str | None = None
    foreign_key: str | None = None  # "schema.table.column" if FK
    foreign_key_name: str | None = None


@dataclass(frozen=True, slots=True)
class TableInfo:
    schema_name: str
    table_name: str
    columns: tuple[ColumnInfo, ...] = field(default_factory=tuple)
    row_count: int | None = None
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class SchemaInfo:
    tables: list[TableInfo]


@dataclass(frozen=True, slots=True)
class RelationshipColumnInfo:
    source_column: str
    target_column: str


@dataclass(frozen=True, slots=True)
class TableRelationshipInfo:
    source_schema_name: str
    source_table_name: str
    target_schema_name: str
    target_table_name: str
    constraint_name: str | None = None
    column_mappings: tuple[RelationshipColumnInfo, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class TableRelationshipsInfo:
    outgoing: tuple[TableRelationshipInfo, ...] = field(default_factory=tuple)
    incoming: tuple[TableRelationshipInfo, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class TableIndexInfo:
    name: str
    columns: tuple[str, ...] = field(default_factory=tuple)
    method: str | None = None
    definition: str | None = None
    is_unique: bool = False
    is_primary: bool = False


@dataclass(frozen=True, slots=True)
class TableConstraintInfo:
    name: str
    kind: str
    columns: tuple[str, ...] = field(default_factory=tuple)
    referenced_schema_name: str | None = None
    referenced_table_name: str | None = None
    referenced_columns: tuple[str, ...] = field(default_factory=tuple)
    definition: str | None = None


@dataclass(frozen=True, slots=True)
class TableEnumInfo:
    column_name: str
    enum_schema_name: str
    enum_name: str
    values: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class TableMetadataPropertyInfo:
    label: str
    value: str


@dataclass(frozen=True, slots=True)
class TableMetadataInfo:
    indexes: tuple[TableIndexInfo, ...] = field(default_factory=tuple)
    constraints: tuple[TableConstraintInfo, ...] = field(default_factory=tuple)
    enums: tuple[TableEnumInfo, ...] = field(default_factory=tuple)
    properties: tuple[TableMetadataPropertyInfo, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ErdColumnInfo:
    name: str
    data_type: str
    is_primary_key: bool = False
    is_foreign_key: bool = False


@dataclass(frozen=True, slots=True)
class ErdTableInfo:
    schema_name: str
    table_name: str
    is_focus: bool
    columns: tuple[ErdColumnInfo, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ErdEdgeInfo:
    id: str
    source_table_key: str
    target_table_key: str
    constraint_name: str | None = None
    column_mappings: tuple[RelationshipColumnInfo, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class TableErdInfo:
    focus_table_key: str
    tables: tuple[ErdTableInfo, ...] = field(default_factory=tuple)
    edges: tuple[ErdEdgeInfo, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class TableDetailInfo:
    table: TableInfo
    relationships: TableRelationshipsInfo
    metadata: TableMetadataInfo
    erd: TableErdInfo


@dataclass(frozen=True, slots=True)
class QueryResult:
    columns: list[str]
    column_types: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: float
    result_shape: str = "tabular"
    data: dict[str, Any] | list[Any] | str | int | float | bool | None = None


class DatabaseDriver(Protocol):
    """Every target database driver implements this interface."""

    async def connect(self, config: ConnectionConfig) -> Any: ...

    async def disconnect(self, connection: Any) -> None: ...

    async def execute(
        self,
        connection: Any,
        sql: str,
        params: dict[str, Any] | None = None,
        max_rows: int | None = None,
        read_only: bool = False,
        backend_query_id: str | None = None,
    ) -> QueryResult: ...

    def stream(
        self,
        connection: Any,
        sql: str,
        params: dict[str, Any] | None = None,
        chunk_size: int = 1000,
    ) -> AsyncIterator[list[list[Any]]]: ...

    async def introspect_schema(self, connection: Any) -> SchemaInfo: ...

    async def introspect_table_metadata(
        self,
        connection: Any,
        schema_name: str,
        table_name: str,
    ) -> TableMetadataInfo: ...

    def get_backend_pid(self, connection: Any) -> int | None: ...

    async def cancel(self, connection: Any) -> None: ...

    async def cancel_backend(
        self,
        config: ConnectionConfig,
        backend_identifier: int | str,
    ) -> bool: ...

    async def test_connection(self, config: ConnectionConfig) -> bool: ...
