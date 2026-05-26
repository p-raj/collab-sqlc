"""PostgreSQL driver implementation."""

import os
import ssl
import tempfile
import time
from collections.abc import AsyncIterator
from typing import Any

import asyncpg

from src.connections.drivers.base import (
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    SchemaInfo,
    TableConstraintInfo,
    TableEnumInfo,
    TableIndexInfo,
    TableInfo,
    TableMetadataInfo,
)

_SCHEMA_QUERY = """
SELECT
    c.table_schema,
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable = 'YES' AS is_nullable,
    CASE WHEN pk_tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END AS is_pk,
    c.column_default,
    pgd.description AS column_comment,
    fk_ccu.table_schema || '.' || fk_ccu.table_name || '.' || fk_ccu.column_name AS foreign_key,
    fk_tc.constraint_name AS foreign_key_name
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage pk_kcu
    ON c.table_schema = pk_kcu.table_schema
    AND c.table_name = pk_kcu.table_name
    AND c.column_name = pk_kcu.column_name
LEFT JOIN information_schema.table_constraints pk_tc
    ON pk_kcu.constraint_name = pk_tc.constraint_name
    AND pk_kcu.table_schema = pk_tc.table_schema
    AND pk_tc.constraint_type = 'PRIMARY KEY'
LEFT JOIN information_schema.key_column_usage fk_kcu
    ON c.table_schema = fk_kcu.table_schema
    AND c.table_name = fk_kcu.table_name
    AND c.column_name = fk_kcu.column_name
LEFT JOIN information_schema.table_constraints fk_tc
    ON fk_kcu.constraint_name = fk_tc.constraint_name
    AND fk_kcu.table_schema = fk_tc.table_schema
    AND fk_tc.constraint_type = 'FOREIGN KEY'
LEFT JOIN information_schema.constraint_column_usage fk_ccu
    ON fk_tc.constraint_name = fk_ccu.constraint_name
    AND fk_tc.table_schema = fk_ccu.constraint_schema
LEFT JOIN pg_catalog.pg_statio_all_tables st
    ON c.table_schema = st.schemaname AND c.table_name = st.relname
LEFT JOIN pg_catalog.pg_description pgd
    ON pgd.objoid = st.relid
    AND pgd.objsubid = c.ordinal_position
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position
"""

_TABLE_INDEXES_QUERY = """
SELECT
    ci.relname AS index_name,
    am.amname AS method,
    i.indisunique AS is_unique,
    i.indisprimary AS is_primary,
    pg_get_indexdef(i.indexrelid) AS definition,
    COALESCE(
        ARRAY(
            SELECT a.attname
            FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a
                ON a.attrelid = i.indrelid
                AND a.attnum = k.attnum
            WHERE k.attnum > 0
            ORDER BY k.ord
        ),
        ARRAY[]::text[]
    ) AS columns
FROM pg_index i
JOIN pg_class ct ON ct.oid = i.indrelid
JOIN pg_namespace nt ON nt.oid = ct.relnamespace
JOIN pg_class ci ON ci.oid = i.indexrelid
JOIN pg_am am ON am.oid = ci.relam
WHERE nt.nspname = $1 AND ct.relname = $2
ORDER BY i.indisprimary DESC, ci.relname
"""

_TABLE_CONSTRAINTS_QUERY = """
SELECT
    c.conname AS name,
    c.contype AS kind,
    COALESCE(
        ARRAY(
            SELECT a.attname
            FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a
                ON a.attrelid = c.conrelid
                AND a.attnum = k.attnum
            ORDER BY k.ord
        ),
        ARRAY[]::text[]
    ) AS columns,
    nr.nspname AS referenced_schema_name,
    cr.relname AS referenced_table_name,
    COALESCE(
        ARRAY(
            SELECT a.attname
            FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a
                ON a.attrelid = c.confrelid
                AND a.attnum = k.attnum
            ORDER BY k.ord
        ),
        ARRAY[]::text[]
    ) AS referenced_columns,
    pg_get_constraintdef(c.oid, true) AS definition
FROM pg_constraint c
JOIN pg_class ct ON ct.oid = c.conrelid
JOIN pg_namespace nt ON nt.oid = ct.relnamespace
LEFT JOIN pg_class cr ON cr.oid = c.confrelid
LEFT JOIN pg_namespace nr ON nr.oid = cr.relnamespace
WHERE nt.nspname = $1 AND ct.relname = $2
ORDER BY c.contype, c.conname
"""

_TABLE_ENUMS_QUERY = """
SELECT
    a.attname AS column_name,
    tn.nspname AS enum_schema_name,
    t.typname AS enum_name,
    ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
JOIN pg_namespace tn ON tn.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = $1
  AND c.relname = $2
  AND a.attnum > 0
  AND NOT a.attisdropped
GROUP BY a.attname, tn.nspname, t.typname
ORDER BY a.attname
"""


class PostgresDriver:
    async def connect(self, config: ConnectionConfig) -> asyncpg.Connection:
        return await asyncpg.connect(
            host=config.host,
            port=config.port,
            database=config.database,
            user=config.username,
            password=config.password,
            ssl=_build_ssl_context(config),
            timeout=10,
        )

    async def disconnect(self, connection: asyncpg.Connection) -> None:
        await connection.close()

    async def execute(
        self,
        connection: asyncpg.Connection,
        sql: str,
        params: dict[str, Any] | None = None,
        max_rows: int | None = None,
        read_only: bool = False,
    ) -> QueryResult:
        start = time.perf_counter()
        stmt = await connection.prepare(sql)
        columns = [col.name for col in stmt.get_attributes()]
        column_types = [col.type.name for col in stmt.get_attributes()]

        args = list(params.values()) if params else []
        if read_only or (max_rows is not None and max_rows > 0):
            async with connection.transaction(readonly=read_only):
                if max_rows is None or max_rows <= 0:
                    rows_raw = await stmt.fetch(*args)
                else:
                    cursor = stmt.cursor(*args)
                    rows_raw = await cursor.fetch(max_rows)
        else:
            rows_raw = await stmt.fetch(*args)
        rows = [list(row.values()) for row in rows_raw]
        elapsed = (time.perf_counter() - start) * 1000

        return QueryResult(
            columns=columns,
            column_types=column_types,
            rows=rows,
            row_count=len(rows),
            execution_time_ms=round(elapsed, 2),
        )

    async def stream(
        self,
        connection: asyncpg.Connection,
        sql: str,
        params: dict[str, Any] | None = None,
        chunk_size: int = 1000,
    ) -> AsyncIterator[list[list[Any]]]:
        async with connection.transaction():
            args = list(params.values()) if params else []
            cursor = await connection.cursor(sql, *args)
            while True:
                rows_raw = await cursor.fetch(chunk_size)
                if not rows_raw:
                    break
                yield [list(row.values()) for row in rows_raw]

    async def introspect_schema(self, connection: asyncpg.Connection) -> SchemaInfo:
        rows = await connection.fetch(_SCHEMA_QUERY)

        # Collect columns per table, deduplicating by column name.
        # Joins on constraint tables can produce multiple rows per column
        # (e.g. column in both PK and FK); we merge is_pk and foreign_key.
        tables_columns: dict[str, dict[str, ColumnInfo]] = {}
        tables_meta: dict[str, tuple[str, str]] = {}
        for row in rows:
            key = f"{row['table_schema']}.{row['table_name']}"
            col_name = row["column_name"]

            if key not in tables_columns:
                tables_columns[key] = {}
                tables_meta[key] = (row["table_schema"], row["table_name"])

            prev = tables_columns[key].get(col_name)
            if prev is not None:
                # Merge: keep is_pk=True if any row has it, keep first non-null FK
                tables_columns[key][col_name] = ColumnInfo(
                    name=prev.name,
                    data_type=prev.data_type,
                    is_nullable=prev.is_nullable,
                    is_primary_key=prev.is_primary_key or row["is_pk"],
                    default_value=prev.default_value,
                    comment=prev.comment,
                    foreign_key=prev.foreign_key or row["foreign_key"],
                    foreign_key_name=prev.foreign_key_name or row["foreign_key_name"],
                )
            else:
                tables_columns[key][col_name] = ColumnInfo(
                    name=col_name,
                    data_type=row["data_type"],
                    is_nullable=row["is_nullable"],
                    is_primary_key=row["is_pk"],
                    default_value=row["column_default"],
                    comment=row["column_comment"],
                    foreign_key=row["foreign_key"],
                    foreign_key_name=row["foreign_key_name"],
                )

        tables = [
            TableInfo(
                schema_name=tables_meta[key][0],
                table_name=tables_meta[key][1],
                columns=tuple(cols.values()),
            )
            for key, cols in tables_columns.items()
        ]
        return SchemaInfo(tables=tables)

    async def introspect_table_metadata(
        self,
        connection: asyncpg.Connection,
        schema_name: str,
        table_name: str,
    ) -> TableMetadataInfo:
        index_rows = await connection.fetch(_TABLE_INDEXES_QUERY, schema_name, table_name)
        constraint_rows = await connection.fetch(_TABLE_CONSTRAINTS_QUERY, schema_name, table_name)
        enum_rows = await connection.fetch(_TABLE_ENUMS_QUERY, schema_name, table_name)

        indexes = tuple(
            TableIndexInfo(
                name=row["index_name"],
                columns=tuple(row["columns"] or []),
                method=row["method"],
                definition=row["definition"],
                is_unique=row["is_unique"],
                is_primary=row["is_primary"],
            )
            for row in index_rows
        )
        constraints = tuple(
            TableConstraintInfo(
                name=row["name"],
                kind=_map_constraint_kind(row["kind"]),
                columns=tuple(row["columns"] or []),
                referenced_schema_name=row["referenced_schema_name"],
                referenced_table_name=row["referenced_table_name"],
                referenced_columns=tuple(row["referenced_columns"] or []),
                definition=row["definition"],
            )
            for row in constraint_rows
        )
        enums = tuple(
            TableEnumInfo(
                column_name=row["column_name"],
                enum_schema_name=row["enum_schema_name"],
                enum_name=row["enum_name"],
                values=tuple(row["values"] or []),
            )
            for row in enum_rows
        )
        return TableMetadataInfo(
            indexes=indexes,
            constraints=constraints,
            enums=enums,
        )

    async def cancel(self, connection: asyncpg.Connection) -> None:
        await connection.reset()

    def get_backend_pid(self, connection: asyncpg.Connection) -> int | None:
        return int(connection.get_server_pid())

    async def cancel_backend(self, config: ConnectionConfig, backend_pid: int) -> bool:
        connection = await self.connect(config)
        try:
            result = await connection.fetchval("SELECT pg_cancel_backend($1)", backend_pid)
            return bool(result)
        finally:
            await self.disconnect(connection)

    async def test_connection(self, config: ConnectionConfig) -> bool:
        conn = None
        try:
            conn = await self.connect(config)
            await conn.fetchval("SELECT 1")
            return True
        except Exception:
            return False
        finally:
            if conn is not None:
                await conn.close()


def _map_constraint_kind(kind: str) -> str:
    return {
        "p": "primary_key",
        "f": "foreign_key",
        "u": "unique",
        "c": "check",
        "x": "exclude",
    }.get(kind, "other")


def _build_ssl_context(config: ConnectionConfig) -> ssl.SSLContext | None:
    if not config.ssl_enabled:
        return None

    if config.ssl_ca:
        # CA content maps to PostgreSQL's verify-ca behavior.
        context = ssl.create_default_context(cadata=config.ssl_ca)
        context.check_hostname = False
    else:
        # No CA content maps to PostgreSQL's require behavior: encrypted transport only.
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

    if config.ssl_cert or config.ssl_key:
        if not config.ssl_cert or not config.ssl_key:
            raise ValueError("SSL client certificate and key must be provided together")
        _load_client_certificate_chain(context, config.ssl_cert, config.ssl_key)

    return context


def _load_client_certificate_chain(
    context: ssl.SSLContext,
    certificate: str,
    private_key: str,
) -> None:
    cert_path = _write_temporary_pem(certificate)
    key_path = _write_temporary_pem(private_key)
    try:
        context.load_cert_chain(certfile=cert_path, keyfile=key_path)
    finally:
        os.unlink(cert_path)
        os.unlink(key_path)


def _write_temporary_pem(content: str) -> str:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as pem_file:
        pem_file.write(content)
        pem_file.write("\n")
        return pem_file.name
