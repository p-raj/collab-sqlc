"""ClickHouse driver implementation.

Uses clickhouse-connect which is synchronous. All calls are wrapped
in asyncio.to_thread() to avoid blocking the event loop.
"""

import asyncio
import time
from collections.abc import AsyncIterator
from typing import Any

import clickhouse_connect

from src.connections.drivers.base import (
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    SchemaInfo,
    TableInfo,
    TableMetadataInfo,
    TableMetadataPropertyInfo,
)

_SCHEMA_QUERY = """
SELECT
    database AS table_schema,
    table AS table_name,
    name AS column_name,
    type AS data_type,
    position
FROM system.columns
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
ORDER BY database, table, position
"""

_TABLE_METADATA_QUERY = """
SELECT
    engine,
    partition_key,
    sorting_key,
    primary_key,
    total_rows
FROM system.tables
WHERE database = {schema_name:String}
  AND name = {table_name:String}
LIMIT 1
"""


class ClickHouseDriver:
    async def connect(self, config: ConnectionConfig) -> clickhouse_connect.driver.Client:
        return await asyncio.to_thread(
            clickhouse_connect.get_client,
            host=config.host,
            port=config.port,
            database=config.database,
            username=config.username,
            password=config.password,
            secure=config.ssl_enabled,
        )

    async def disconnect(self, connection: clickhouse_connect.driver.Client) -> None:
        await asyncio.to_thread(connection.close)

    async def execute(
        self,
        connection: clickhouse_connect.driver.Client,
        sql: str,
        params: dict[str, Any] | None = None,
        max_rows: int | None = None,
        read_only: bool = False,
        backend_query_id: str | None = None,
    ) -> QueryResult:
        start = time.perf_counter()
        settings: dict[str, Any] = {}
        if max_rows is not None and max_rows > 0:
            settings.update({"max_result_rows": max_rows, "result_overflow_mode": "break"})
        if read_only:
            settings["readonly"] = 2
        result = await asyncio.to_thread(
            connection.query,
            sql,
            parameters=params or {},
            settings=settings or None,
            transport_settings=(
                {"query_id": backend_query_id} if backend_query_id is not None else None
            ),
        )
        elapsed = (time.perf_counter() - start) * 1000

        columns = list(result.column_names)
        column_types = [str(t) for t in result.column_types]
        rows = [list(row) for row in result.result_rows]

        return QueryResult(
            columns=columns,
            column_types=column_types,
            rows=rows,
            row_count=len(rows),
            execution_time_ms=round(elapsed, 2),
        )

    async def stream(
        self,
        connection: clickhouse_connect.driver.Client,
        sql: str,
        params: dict[str, Any] | None = None,
        chunk_size: int = 1000,
    ) -> AsyncIterator[list[list[Any]]]:
        # ClickHouse connect doesn't support true streaming cursors.
        # We fetch all and yield in chunks for consistent interface.
        result = await asyncio.to_thread(connection.query, sql, parameters=params or {})
        rows = [list(row) for row in result.result_rows]
        for i in range(0, len(rows), chunk_size):
            yield rows[i : i + chunk_size]

    async def introspect_schema(self, connection: clickhouse_connect.driver.Client) -> SchemaInfo:
        result = await asyncio.to_thread(connection.query, _SCHEMA_QUERY)

        tables_columns: dict[str, list[ColumnInfo]] = {}
        tables_meta: dict[str, tuple[str, str]] = {}
        for row in result.result_rows:
            schema_name, table_name, col_name, data_type, _position = row
            key = f"{schema_name}.{table_name}"
            col = ColumnInfo(name=col_name, data_type=data_type)
            if key not in tables_columns:
                tables_columns[key] = []
                tables_meta[key] = (schema_name, table_name)
            tables_columns[key].append(col)

        tables = [
            TableInfo(
                schema_name=tables_meta[key][0],
                table_name=tables_meta[key][1],
                columns=tuple(cols),
            )
            for key, cols in tables_columns.items()
        ]
        return SchemaInfo(tables=tables)

    async def introspect_table_metadata(
        self,
        connection: clickhouse_connect.driver.Client,
        schema_name: str,
        table_name: str,
    ) -> TableMetadataInfo:
        result = await asyncio.to_thread(
            connection.query,
            _TABLE_METADATA_QUERY,
            parameters={"schema_name": schema_name, "table_name": table_name},
        )
        if not result.result_rows:
            return TableMetadataInfo()

        engine, partition_key, sorting_key, primary_key, total_rows = result.result_rows[0]
        properties = tuple(
            TableMetadataPropertyInfo(label=label, value=value)
            for label, value in (
                ("Engine", str(engine) if engine else "—"),
                ("Partition key", str(partition_key) if partition_key else "—"),
                ("Sorting key", str(sorting_key) if sorting_key else "—"),
                ("Primary key", str(primary_key) if primary_key else "—"),
                ("Estimated rows", str(total_rows) if total_rows is not None else "—"),
            )
        )
        return TableMetadataInfo(properties=properties)

    async def cancel(self, connection: clickhouse_connect.driver.Client) -> None:
        # Cancellation is query-id based for ClickHouse, so callers should use
        # cancel_backend() with the persisted backend_query_id.
        pass

    def get_backend_pid(self, connection: clickhouse_connect.driver.Client) -> int | None:
        return None

    async def cancel_backend(self, config: ConnectionConfig, backend_identifier: int | str) -> bool:
        conn = None
        try:
            conn = await self.connect(config)
            query_id = str(backend_identifier)
            await asyncio.to_thread(
                conn.command,
                "KILL QUERY WHERE query_id = {query_id:String} SYNC",
                parameters={"query_id": query_id},
            )
            return True
        except Exception:
            return False
        finally:
            if conn is not None:
                await self.disconnect(conn)

    async def test_connection(self, config: ConnectionConfig) -> bool:
        conn = None
        try:
            conn = await self.connect(config)
            await asyncio.to_thread(conn.query, "SELECT 1")
            return True
        except Exception:
            return False
        finally:
            if conn is not None:
                await asyncio.to_thread(conn.close)
