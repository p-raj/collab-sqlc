"""Redis standalone driver implementation."""

from __future__ import annotations

import shlex
import time
from typing import TYPE_CHECKING, Any

import redis.asyncio as redis

from src.connections.drivers.base import (
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    SchemaInfo,
    TableInfo,
    TableMetadataInfo,
    TableMetadataPropertyInfo,
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

_READ_ONLY_COMMANDS = frozenset(
    {
        "dbsize",
        "exists",
        "get",
        "hget",
        "hgetall",
        "hscan",
        "hlen",
        "keys",
        "llen",
        "lrange",
        "mget",
        "scan",
        "scard",
        "sscan",
        "smembers",
        "strlen",
        "ttl",
        "type",
        "xinfo",
        "xlen",
        "xrange",
        "zcard",
        "zrange",
        "zscan",
    }
)


class RedisDriver:
    async def connect(self, config: ConnectionConfig) -> redis.Redis:
        db = int(config.database or 0)
        password = config.password or None
        credentials = config.credentials or {}
        return redis.Redis(
            host=config.host,
            port=config.port,
            db=db,
            username=config.username or None,
            password=credentials.get("password") or password,
            ssl=config.ssl_enabled,
            decode_responses=False,
            socket_connect_timeout=10,
        )

    async def disconnect(self, connection: redis.Redis) -> None:
        await connection.aclose()

    async def execute(
        self,
        connection: redis.Redis,
        sql: str,
        params: dict[str, Any] | None = None,
        max_rows: int | None = None,
        read_only: bool = False,
        backend_query_id: str | None = None,
    ) -> QueryResult:
        del params, backend_query_id
        command = _parse_command(sql)
        if not command:
            raise ValueError("Redis command cannot be empty")
        command_name = command[0].lower()
        if read_only and command_name not in _READ_ONLY_COMMANDS:
            raise ValueError("Redis command requires write mode")

        start = time.perf_counter()
        value = await connection.execute_command(*command)
        elapsed = (time.perf_counter() - start) * 1000
        result = _to_query_result(value, max_rows=max_rows)
        return QueryResult(
            columns=result.columns,
            column_types=result.column_types,
            rows=result.rows,
            row_count=result.row_count,
            execution_time_ms=round(elapsed, 2),
            result_shape=result.result_shape,
            data=result.data,
        )

    async def stream(
        self,
        connection: redis.Redis,
        sql: str,
        params: dict[str, Any] | None = None,
        chunk_size: int = 1000,
    ) -> AsyncIterator[list[list[Any]]]:
        result = await self.execute(connection, sql, params=params)
        for index in range(0, len(result.rows), chunk_size):
            yield result.rows[index : index + chunk_size]

    async def introspect_schema(self, connection: redis.Redis) -> SchemaInfo:
        keys: list[TableInfo] = []
        cursor = 0
        scanned = 0
        while True:
            cursor, batch = await connection.scan(cursor=cursor, count=100)
            for key in batch:
                key_type = await connection.type(key)
                key_name = _to_display_value(key)
                key_type_name = _to_display_value(key_type)
                keys.append(
                    TableInfo(
                        schema_name="redis",
                        table_name=key_name,
                        columns=(ColumnInfo(name="type", data_type=key_type_name),),
                    )
                )
                scanned += 1
                if scanned >= 500:
                    return SchemaInfo(tables=keys)
            if cursor == 0:
                return SchemaInfo(tables=keys)

    async def introspect_table_metadata(
        self,
        connection: redis.Redis,
        schema_name: str,
        table_name: str,
    ) -> TableMetadataInfo:
        del schema_name
        key_type = await connection.type(table_name)
        key_type_name = _to_display_value(key_type)
        ttl = await connection.ttl(table_name)
        size = await _key_size(connection, table_name, key_type_name)
        return TableMetadataInfo(
            properties=(
                TableMetadataPropertyInfo(label="Type", value=key_type_name),
                TableMetadataPropertyInfo(label="TTL", value=_format_ttl(ttl)),
                TableMetadataPropertyInfo(label="Size", value=size),
            )
        )

    def get_backend_pid(self, connection: redis.Redis) -> int | None:
        del connection
        return None

    async def cancel(self, connection: redis.Redis) -> None:
        del connection

    async def cancel_backend(
        self,
        config: ConnectionConfig,
        backend_identifier: int | str,
    ) -> bool:
        del config, backend_identifier
        return False

    async def test_connection(self, config: ConnectionConfig) -> bool:
        conn = await self.connect(config)
        try:
            return bool(await conn.ping())
        finally:
            await self.disconnect(conn)


def _parse_command(sql: str) -> list[str]:
    return shlex.split(sql.strip())


def _to_query_result(value: Any, *, max_rows: int | None) -> QueryResult:
    value = _normalize_value(value)
    if isinstance(value, dict):
        rows = [[key, item] for key, item in value.items()]
        rows = _limit_rows(rows, max_rows)
        return QueryResult(
            columns=["key", "value"],
            column_types=["string", "string"],
            rows=rows,
            row_count=len(rows),
            execution_time_ms=0,
            result_shape="key_value",
            data=value,
        )
    if isinstance(value, (list, tuple, set)):
        values = list(value)
        rows = [[index, item] for index, item in enumerate(values)]
        rows = _limit_rows(rows, max_rows)
        return QueryResult(
            columns=["index", "value"],
            column_types=["integer", "string"],
            rows=rows,
            row_count=len(rows),
            execution_time_ms=0,
            result_shape="list",
            data=values,
        )
    return QueryResult(
        columns=["value"],
        column_types=[type(value).__name__],
        rows=[[value]],
        row_count=1,
        execution_time_ms=0,
        result_shape="scalar",
        data=value,
    )


def _normalize_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return _to_display_value(value)
    if isinstance(value, dict):
        return {_normalize_value(key): _normalize_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize_value(item) for item in value]
    if isinstance(value, set):
        return [_normalize_value(item) for item in value]
    return value


def _to_display_value(value: Any) -> str:
    if not isinstance(value, bytes):
        return str(value)
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError:
        preview = value[:128].hex()
        suffix = "…" if len(value) > 128 else ""
        return f"0x{preview}{suffix}"


def _limit_rows(rows: list[list[Any]], max_rows: int | None) -> list[list[Any]]:
    if max_rows is None or max_rows <= 0:
        return rows
    return rows[:max_rows]


async def _key_size(connection: redis.Redis, key: str, key_type: str) -> str:
    match key_type:
        case "string":
            return str(await connection.strlen(key))
        case "hash":
            return str(await connection.hlen(key))
        case "list":
            return str(await connection.llen(key))
        case "set":
            return str(await connection.scard(key))
        case "zset":
            return str(await connection.zcard(key))
        case "stream":
            return str(await connection.xlen(key))
        case _:
            return "—"


def _format_ttl(ttl: int) -> str:
    if ttl == -1:
        return "No expiry"
    if ttl == -2:
        return "Missing"
    return f"{ttl}s"
