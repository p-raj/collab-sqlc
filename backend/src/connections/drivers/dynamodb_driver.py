"""DynamoDB PartiQL driver implementation."""

from __future__ import annotations

import asyncio
import time
from decimal import Decimal
from typing import Any

from src.connections.drivers.base import (
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    SchemaInfo,
    TableIndexInfo,
    TableInfo,
    TableMetadataInfo,
    TableMetadataPropertyInfo,
)

class DynamoDBDriver:
    async def connect(self, config: ConnectionConfig) -> Any:
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("boto3 is required for DynamoDB connections") from exc

        credentials = config.credentials or {}
        region = str((config.config or {}).get("region") or config.database)
        endpoint_url = (config.config or {}).get("endpoint_url") or None
        return boto3.client(
            "dynamodb",
            region_name=region,
            aws_access_key_id=credentials.get("access_key_id") or config.username,
            aws_secret_access_key=credentials.get("secret_access_key") or config.password,
            aws_session_token=credentials.get("session_token") or None,
            endpoint_url=endpoint_url,
        )

    async def disconnect(self, connection: Any) -> None:
        del connection

    async def execute(
        self,
        connection: Any,
        sql: str,
        params: dict[str, Any] | None = None,
        max_rows: int | None = None,
        read_only: bool = False,
        backend_query_id: str | None = None,
    ) -> QueryResult:
        del backend_query_id
        if read_only and not sql.lstrip().lower().startswith("select"):
            raise ValueError("DynamoDB statement requires write mode")

        start = time.perf_counter()
        items: list[dict[str, Any]] = []
        next_token: str | None = None
        limit = max_rows if max_rows and max_rows > 0 else None
        while True:
            request: dict[str, Any] = {"Statement": sql}
            if params:
                request["Parameters"] = [_to_attribute_value(value) for value in params.values()]
            if next_token:
                request["NextToken"] = next_token
            response = await asyncio.to_thread(connection.execute_statement, **request)
            items.extend(_from_attribute_map(item) for item in response.get("Items", []))
            if limit is not None and len(items) >= limit:
                items = items[:limit]
                break
            next_token = response.get("NextToken")
            if not next_token:
                break

        elapsed = (time.perf_counter() - start) * 1000
        columns = _document_columns(items)
        rows = [[item.get(column) for column in columns] for item in items]
        return QueryResult(
            columns=columns,
            column_types=["document"] * len(columns),
            rows=rows,
            row_count=len(items),
            execution_time_ms=round(elapsed, 2),
            result_shape="document",
            data=items,
        )

    def stream(
        self,
        connection: Any,
        sql: str,
        params: dict[str, Any] | None = None,
        chunk_size: int = 1000,
    ):
        del connection, sql, params, chunk_size
        raise NotImplementedError("DynamoDB streaming export is not supported")

    async def introspect_schema(self, connection: Any) -> SchemaInfo:
        tables: list[TableInfo] = []
        paginator = connection.get_paginator("list_tables")
        pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
        for page in pages:
            for table_name in page.get("TableNames", []):
                table = await asyncio.to_thread(connection.describe_table, TableName=table_name)
                columns = tuple(
                    ColumnInfo(
                        name=attr["AttributeName"],
                        data_type=attr["AttributeType"],
                        is_primary_key=any(
                            key["AttributeName"] == attr["AttributeName"]
                            for key in table["Table"].get("KeySchema", [])
                        ),
                    )
                    for attr in table["Table"].get("AttributeDefinitions", [])
                )
                tables.append(
                    TableInfo(schema_name="dynamodb", table_name=table_name, columns=columns)
                )
        return SchemaInfo(tables=tables)

    async def introspect_table_metadata(
        self,
        connection: Any,
        schema_name: str,
        table_name: str,
    ) -> TableMetadataInfo:
        del schema_name
        table = await asyncio.to_thread(connection.describe_table, TableName=table_name)
        table_info = table["Table"]
        indexes = tuple(
            TableIndexInfo(
                name=index["IndexName"],
                columns=tuple(key["AttributeName"] for key in index.get("KeySchema", [])),
                method="global_secondary",
            )
            for index in table_info.get("GlobalSecondaryIndexes", [])
        ) + tuple(
            TableIndexInfo(
                name=index["IndexName"],
                columns=tuple(key["AttributeName"] for key in index.get("KeySchema", [])),
                method="local_secondary",
            )
            for index in table_info.get("LocalSecondaryIndexes", [])
        )
        properties = tuple(
            TableMetadataPropertyInfo(label=label, value=value)
            for label, value in (
                ("Status", str(table_info.get("TableStatus", "—"))),
                ("Billing mode", _billing_mode(table_info)),
                ("Items", str(table_info.get("ItemCount", "—"))),
                ("Size bytes", str(table_info.get("TableSizeBytes", "—"))),
                ("Stream", _stream_status(table_info)),
            )
        )
        return TableMetadataInfo(indexes=indexes, properties=properties)

    def get_backend_pid(self, connection: Any) -> int | None:
        del connection
        return None

    async def cancel(self, connection: Any) -> None:
        del connection

    async def cancel_backend(self, config: ConnectionConfig, backend_identifier: int | str) -> bool:
        del config, backend_identifier
        return False

    async def test_connection(self, config: ConnectionConfig) -> bool:
        client = await self.connect(config)
        await asyncio.to_thread(client.list_tables, Limit=1)
        return True


def _to_attribute_value(value: Any) -> dict[str, Any]:
    if value is None:
        return {"NULL": True}
    if isinstance(value, bool):
        return {"BOOL": value}
    if isinstance(value, (int, float, Decimal)):
        return {"N": str(value)}
    return {"S": str(value)}


def _from_attribute_map(item: dict[str, Any]) -> dict[str, Any]:
    return {key: _from_attribute_value(value) for key, value in item.items()}


def _from_attribute_value(value: dict[str, Any]) -> Any:
    if "S" in value:
        return value["S"]
    if "N" in value:
        raw = value["N"]
        return int(raw) if str(raw).isdigit() else float(raw)
    if "BOOL" in value:
        return value["BOOL"]
    if "NULL" in value:
        return None
    if "L" in value:
        return [_from_attribute_value(item) for item in value["L"]]
    if "M" in value:
        return _from_attribute_map(value["M"])
    return value


def _document_columns(items: list[dict[str, Any]]) -> list[str]:
    columns: list[str] = []
    for item in items:
        for key in item:
            if key not in columns:
                columns.append(key)
    return columns


def _billing_mode(table: dict[str, Any]) -> str:
    billing = table.get("BillingModeSummary") or {}
    return str(billing.get("BillingMode", "PROVISIONED"))


def _stream_status(table: dict[str, Any]) -> str:
    stream = table.get("StreamSpecification") or {}
    if not stream.get("StreamEnabled"):
        return "Disabled"
    return str(stream.get("StreamViewType", "Enabled"))
