"""Schema introspection service with Redis caching."""

from __future__ import annotations

import base64
import binascii
from dataclasses import asdict
from typing import TYPE_CHECKING

import orjson
from loguru import logger

from src.connections.drivers.base import (
    ErdColumnInfo,
    ErdEdgeInfo,
    ErdTableInfo,
    RelationshipColumnInfo,
    SchemaInfo,
    TableDetailInfo,
    TableErdInfo,
    TableInfo,
    TableMetadataInfo,
    TableRelationshipInfo,
    TableRelationshipsInfo,
)
from src.connections.engine_registry import get_database_engine
from src.shared.domain.errors import NotFoundError
from src.schema.domain.explorer_models import (
    CatalogObjectInfo,
    CatalogObjectKind,
    CatalogObjectRef,
    ObjectDetailInfo,
    ObjectSectionInfo,
    PreviewOperationInfo,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

    from src.connections.domain.models import ConnectionModel
    from src.connections.service.connection_service import ConnectionService

_CACHE_PREFIX = "schema:"
_DETAIL_CACHE_PREFIX = "schema-detail:"


class SchemaService:
    def __init__(
        self,
        connection_service: ConnectionService,
        redis: Redis,
        cache_ttl: int = 300,
        dynamodb_cache_ttl: int = 86400,
    ) -> None:
        self._conn_service = connection_service
        self._redis = redis
        self._cache_ttl = cache_ttl
        self._dynamodb_cache_ttl = dynamodb_cache_ttl

    async def get_schema(
        self,
        conn_model: ConnectionModel,
        force_refresh: bool = False,
    ) -> tuple[SchemaInfo, bool]:
        """Return (schema, was_cached). Uses Redis cache unless force_refresh."""
        cache_key = f"{_CACHE_PREFIX}{conn_model.id}"

        if not force_refresh:
            cached = await self._read_cache(cache_key)
            if cached is not None:
                return cached, True

        schema = await self._introspect(conn_model)
        await self._write_cache(cache_key, schema, self._cache_ttl_for(conn_model))
        return schema, False

    async def invalidate(self, connection_id: str) -> None:
        cache_key = f"{_CACHE_PREFIX}{connection_id}"
        await self._redis.delete(cache_key)
        detail_keys = [
            key
            async for key in self._redis.scan_iter(match=f"{_DETAIL_CACHE_PREFIX}{connection_id}:*")
        ]
        if detail_keys:
            await self._redis.delete(*detail_keys)

    async def get_table_detail(
        self,
        conn_model: ConnectionModel,
        schema_name: str,
        table_name: str,
        force_refresh: bool = False,
    ) -> tuple[TableDetailInfo, bool]:
        """Return a rich table detail payload for the explorer tabs."""
        cache_key = _table_detail_cache_key(conn_model.id, schema_name, table_name)
        if not force_refresh:
            cached = await self._read_table_detail_cache(cache_key)
            if cached is not None:
                return cached, True

        schema, _ = await self.get_schema(conn_model, force_refresh=force_refresh)
        table = _find_table(schema, schema_name, table_name)
        relationships = _build_relationships(schema, schema_name, table_name)
        metadata = await self._introspect_table_metadata(conn_model, schema_name, table_name)
        erd = _build_erd(schema, table, relationships)
        detail = TableDetailInfo(
            table=table,
            relationships=relationships,
            metadata=metadata,
            erd=erd,
        )
        await self._write_table_detail_cache(cache_key, detail, self._cache_ttl_for(conn_model))
        return detail, False

    async def get_catalog_objects(
        self,
        conn_model: ConnectionModel,
        force_refresh: bool = False,
    ) -> tuple[list[CatalogObjectInfo], bool]:
        schema, was_cached = await self.get_schema(conn_model, force_refresh=force_refresh)
        objects = [_table_to_catalog_object(conn_model.db_type, table) for table in schema.tables]
        return objects, was_cached

    async def get_object_detail(
        self,
        conn_model: ConnectionModel,
        object_id: str,
        force_refresh: bool = False,
    ) -> tuple[ObjectDetailInfo, bool]:
        ref = _decode_object_id(object_id)
        _validate_object_ref(ref, conn_model.db_type, object_id)
        schema_name = ref.namespace
        table_name = ref.name
        detail, was_cached = await self.get_table_detail(
            conn_model,
            schema_name,
            table_name,
            force_refresh=force_refresh,
        )
        catalog_object = _table_to_catalog_object(conn_model.db_type, detail.table)
        preview = _preview_operation(conn_model.db_type, detail.table)
        sections = _object_sections(conn_model.db_type, detail)
        return (
            ObjectDetailInfo(
                object=catalog_object,
                engine_kind=_engine_kind(conn_model.db_type),
                sections=sections,
                preview_operation=preview,
            ),
            was_cached,
        )

    def _cache_ttl_for(self, conn_model: ConnectionModel) -> int:
        return (
            self._dynamodb_cache_ttl
            if getattr(conn_model, "db_type", None) == "dynamodb"
            else self._cache_ttl
        )

    async def _introspect(self, conn_model: ConnectionModel) -> SchemaInfo:
        driver = self._conn_service.get_driver(conn_model)
        config = await self._conn_service.get_connection_config(conn_model)
        connection = await driver.connect(config)
        try:
            return await driver.introspect_schema(connection)
        finally:
            await driver.disconnect(connection)

    async def _introspect_table_metadata(
        self,
        conn_model: ConnectionModel,
        schema_name: str,
        table_name: str,
    ) -> TableMetadataInfo:
        driver = self._conn_service.get_driver(conn_model)
        config = await self._conn_service.get_connection_config(conn_model)
        connection = await driver.connect(config)
        try:
            return await driver.introspect_table_metadata(connection, schema_name, table_name)
        finally:
            await driver.disconnect(connection)

    async def _read_cache(self, key: str) -> SchemaInfo | None:
        raw = await self._redis.get(key)
        if raw is None:
            return None
        try:
            data = orjson.loads(raw)
            return _deserialize_schema(data)
        except (orjson.JSONDecodeError, KeyError, TypeError):
            logger.warning("Corrupt schema cache for %s, ignoring", key)
            return None

    async def _write_cache(self, key: str, schema: SchemaInfo, ttl: int) -> None:
        data = _serialize_schema(schema)
        await self._redis.setex(key, ttl, orjson.dumps(data))

    async def _read_table_detail_cache(self, key: str) -> TableDetailInfo | None:
        raw = await self._redis.get(key)
        if raw is None:
            return None
        try:
            data = orjson.loads(raw)
            return _deserialize_table_detail(data)
        except (orjson.JSONDecodeError, KeyError, TypeError):
            logger.warning("Corrupt schema detail cache for %s, ignoring", key)
            return None

    async def _write_table_detail_cache(self, key: str, detail: TableDetailInfo, ttl: int) -> None:
        data = _serialize_table_detail(detail)
        await self._redis.setex(key, ttl, orjson.dumps(data))


def _serialize_schema(schema: SchemaInfo) -> dict[str, object]:
    return {
        "tables": [asdict(t) for t in schema.tables],
    }


def _deserialize_schema(data: dict[str, object]) -> SchemaInfo:
    from src.connections.drivers.base import ColumnInfo, TableInfo

    tables_raw = data["tables"]
    assert isinstance(tables_raw, list | tuple)

    tables: list[TableInfo] = []
    for t in tables_raw:
        assert isinstance(t, dict)
        cols = tuple(
            ColumnInfo(
                name=c["name"],
                data_type=c["data_type"],
                is_nullable=c.get("is_nullable", True),
                is_primary_key=c.get("is_primary_key", False),
                default_value=c.get("default_value"),
                comment=c.get("comment"),
                foreign_key=c.get("foreign_key"),
                foreign_key_name=c.get("foreign_key_name"),
            )
            for c in _ensure_sequence(t["columns"])
        )
        tables.append(
            TableInfo(
                schema_name=t["schema_name"],
                table_name=t["table_name"],
                columns=cols,
                row_count=t.get("row_count"),
                comment=t.get("comment"),
            )
        )
    return SchemaInfo(tables=tables)


def _serialize_table_detail(detail: TableDetailInfo) -> dict[str, object]:
    return asdict(detail)


def _deserialize_table_detail(data: dict[str, object]) -> TableDetailInfo:
    from src.connections.drivers.base import (
        ErdColumnInfo,
        ErdEdgeInfo,
        ErdTableInfo,
        RelationshipColumnInfo,
        TableConstraintInfo,
        TableDetailInfo,
        TableEnumInfo,
        TableErdInfo,
        TableIndexInfo,
        TableMetadataInfo,
        TableMetadataPropertyInfo,
        TableRelationshipInfo,
        TableRelationshipsInfo,
    )

    table_raw = data["table"]
    assert isinstance(table_raw, dict)
    relationships_raw = data["relationships"]
    assert isinstance(relationships_raw, dict)
    metadata_raw = data["metadata"]
    assert isinstance(metadata_raw, dict)
    erd_raw = data["erd"]
    assert isinstance(erd_raw, dict)

    table = _deserialize_table(table_raw)
    relationships = TableRelationshipsInfo(
        outgoing=tuple(
            TableRelationshipInfo(
                source_schema_name=item["source_schema_name"],
                source_table_name=item["source_table_name"],
                target_schema_name=item["target_schema_name"],
                target_table_name=item["target_table_name"],
                constraint_name=item.get("constraint_name"),
                column_mappings=tuple(
                    RelationshipColumnInfo(
                        source_column=mapping["source_column"],
                        target_column=mapping["target_column"],
                    )
                    for mapping in _ensure_sequence(item.get("column_mappings"))
                ),
            )
            for item in _ensure_sequence(relationships_raw.get("outgoing"))
        ),
        incoming=tuple(
            TableRelationshipInfo(
                source_schema_name=item["source_schema_name"],
                source_table_name=item["source_table_name"],
                target_schema_name=item["target_schema_name"],
                target_table_name=item["target_table_name"],
                constraint_name=item.get("constraint_name"),
                column_mappings=tuple(
                    RelationshipColumnInfo(
                        source_column=mapping["source_column"],
                        target_column=mapping["target_column"],
                    )
                    for mapping in _ensure_sequence(item.get("column_mappings"))
                ),
            )
            for item in _ensure_sequence(relationships_raw.get("incoming"))
        ),
    )
    metadata = TableMetadataInfo(
        indexes=tuple(
            TableIndexInfo(
                name=item["name"],
                columns=tuple(item.get("columns", [])),
                method=item.get("method"),
                definition=item.get("definition"),
                is_unique=item.get("is_unique", False),
                is_primary=item.get("is_primary", False),
            )
            for item in _ensure_sequence(metadata_raw.get("indexes"))
        ),
        constraints=tuple(
            TableConstraintInfo(
                name=item["name"],
                kind=item["kind"],
                columns=tuple(item.get("columns", [])),
                referenced_schema_name=item.get("referenced_schema_name"),
                referenced_table_name=item.get("referenced_table_name"),
                referenced_columns=tuple(item.get("referenced_columns", [])),
                definition=item.get("definition"),
            )
            for item in _ensure_sequence(metadata_raw.get("constraints"))
        ),
        enums=tuple(
            TableEnumInfo(
                column_name=item["column_name"],
                enum_schema_name=item["enum_schema_name"],
                enum_name=item["enum_name"],
                values=tuple(item.get("values", [])),
            )
            for item in _ensure_sequence(metadata_raw.get("enums"))
        ),
        properties=tuple(
            TableMetadataPropertyInfo(
                label=item["label"],
                value=item["value"],
            )
            for item in _ensure_sequence(metadata_raw.get("properties"))
        ),
    )
    erd = TableErdInfo(
        focus_table_key=erd_raw["focus_table_key"],
        tables=tuple(
            ErdTableInfo(
                schema_name=item["schema_name"],
                table_name=item["table_name"],
                is_focus=item["is_focus"],
                columns=tuple(
                    ErdColumnInfo(
                        name=column["name"],
                        data_type=column["data_type"],
                        is_primary_key=column.get("is_primary_key", False),
                        is_foreign_key=column.get("is_foreign_key", False),
                    )
                    for column in _ensure_sequence(item.get("columns"))
                ),
            )
            for item in _ensure_sequence(erd_raw.get("tables"))
        ),
        edges=tuple(
            ErdEdgeInfo(
                id=item["id"],
                source_table_key=item["source_table_key"],
                target_table_key=item["target_table_key"],
                constraint_name=item.get("constraint_name"),
                column_mappings=tuple(
                    RelationshipColumnInfo(
                        source_column=mapping["source_column"],
                        target_column=mapping["target_column"],
                    )
                    for mapping in _ensure_sequence(item.get("column_mappings"))
                ),
            )
            for item in _ensure_sequence(erd_raw.get("edges"))
        ),
    )
    return TableDetailInfo(
        table=table,
        relationships=relationships,
        metadata=metadata,
        erd=erd,
    )


def _deserialize_table(data: dict[str, object]) -> TableInfo:
    from src.connections.drivers.base import ColumnInfo, TableInfo

    columns_raw = data["columns"]
    assert isinstance(columns_raw, list | tuple)
    return TableInfo(
        schema_name=data["schema_name"],
        table_name=data["table_name"],
        columns=tuple(
            ColumnInfo(
                name=column["name"],
                data_type=column["data_type"],
                is_nullable=column.get("is_nullable", True),
                is_primary_key=column.get("is_primary_key", False),
                default_value=column.get("default_value"),
                comment=column.get("comment"),
                foreign_key=column.get("foreign_key"),
                foreign_key_name=column.get("foreign_key_name"),
            )
            for column in columns_raw
        ),
        row_count=data.get("row_count"),
        comment=data.get("comment"),
    )


def _ensure_sequence(value: object) -> list[object] | tuple[object, ...]:
    if value is None:
        return []
    assert isinstance(value, list | tuple)
    return value


def _table_detail_cache_key(connection_id: str, schema_name: str, table_name: str) -> str:
    return f"{_DETAIL_CACHE_PREFIX}{connection_id}:{schema_name}:{table_name}"


def _table_to_catalog_object(db_type: str, table: TableInfo) -> CatalogObjectInfo:
    object_kind = _object_kind_for_engine(db_type)
    data_type = table.columns[0].data_type if db_type == "redis" and table.columns else None
    namespace = table.schema_name
    name = table.table_name
    return CatalogObjectInfo(
        id=_encode_object_id(db_type, namespace, name),
        kind=object_kind,
        namespace=namespace,
        name=name,
        display_name=name,
        data_type=data_type,
        metadata={"schema_name": namespace, "table_name": name},
    )


def _encode_object_id(db_type: str, namespace: str, name: str) -> str:
    payload = orjson.dumps(
        {
            "version": 1,
            "engine": db_type,
            "kind": _object_kind_for_engine(db_type),
            "namespace": namespace,
            "name": name,
        }
    )
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_object_id(object_id: str) -> CatalogObjectRef:
    try:
        padding = "=" * (-len(object_id) % 4)
        decoded = base64.urlsafe_b64decode(f"{object_id}{padding}")
        data = orjson.loads(decoded)
        if not isinstance(data, dict):
            raise TypeError
        version = data["version"]
        engine = data["engine"]
        kind = data["kind"]
        namespace = data["namespace"]
        name = data["name"]
        if (
            version != 1
            or not isinstance(engine, str)
            or kind not in {"table", "key"}
            or not isinstance(namespace, str)
            or not isinstance(name, str)
        ):
            raise TypeError
        return CatalogObjectRef(engine=engine, kind=kind, namespace=namespace, name=name)
    except (binascii.Error, KeyError, TypeError, ValueError, orjson.JSONDecodeError) as exc:
        raise NotFoundError("Catalog object", object_id) from exc


def _validate_object_ref(ref: CatalogObjectRef, db_type: str, object_id: str) -> None:
    if ref.engine != db_type or ref.kind != _object_kind_for_engine(db_type):
        raise NotFoundError("Catalog object", object_id)


def _object_kind_for_engine(db_type: str) -> CatalogObjectKind:
    return "key" if db_type == "redis" else "table"


def _engine_kind(db_type: str) -> str:
    return get_database_engine(db_type).engine_kind


def _object_sections(db_type: str, detail: TableDetailInfo) -> tuple[ObjectSectionInfo, ...]:
    if db_type == "redis":
        return (
            ObjectSectionInfo(
                id="key-info",
                title="Key Info",
                kind="redis_key",
                description="Redis key type, TTL, and size metadata.",
                properties=detail.metadata.properties,
            ),
            ObjectSectionInfo(
                id="preview",
                title="Preview Command",
                kind="snippets",
                description="Read command generated for this key type.",
                snippets=(_preview_operation(db_type, detail.table),),
            ),
        )
    if db_type == "dynamodb":
        return (
            ObjectSectionInfo(
                id="attributes",
                title="Attributes",
                kind="attributes",
                description="Known DynamoDB key and indexed attributes.",
                columns=detail.table.columns,
            ),
            ObjectSectionInfo(
                id="indexes",
                title="Indexes",
                kind="indexes",
                description="Global and local secondary indexes for this table.",
                indexes=detail.metadata.indexes,
            ),
            ObjectSectionInfo(
                id="metadata",
                title="Metadata",
                kind="properties",
                description="DynamoDB table settings and status.",
                properties=detail.metadata.properties,
            ),
            ObjectSectionInfo(
                id="snippets",
                title="Snippets",
                kind="snippets",
                description="PartiQL starters for this table.",
                snippets=tuple(_dynamodb_snippets(detail.table)),
            ),
        )
    return (
        ObjectSectionInfo(
            id="schema",
            title="Table Schema",
            kind="attributes",
            description="Columns and table structure.",
            columns=detail.table.columns,
        ),
        ObjectSectionInfo(
            id="relationships",
            title="Relationships",
            kind="relationships",
            description="Foreign-key links around this table.",
            relationships=detail.relationships,
        ),
        ObjectSectionInfo(
            id="metadata",
            title="Metadata",
            kind="properties",
            description="Indexes, constraints, enums, and engine metadata.",
            indexes=detail.metadata.indexes,
            properties=detail.metadata.properties,
        ),
        ObjectSectionInfo(
            id="erd",
            title="ERD",
            kind="erd",
            description="Local relationship graph.",
            erd=detail.erd,
        ),
    )


def _preview_operation(db_type: str, table: TableInfo) -> PreviewOperationInfo:
    if db_type == "redis":
        key_type = table.columns[0].data_type if table.columns else "unknown"
        return PreviewOperationInfo(
            label="Preview value",
            language="redis-command",
            text=_redis_preview_command(table.table_name, key_type),
        )
    if db_type == "dynamodb":
        return PreviewOperationInfo(
            label="Preview items",
            language="partiql",
            text=f"SELECT * FROM {_quote_identifier(table.table_name)} LIMIT 100;",
        )
    return PreviewOperationInfo(
        label="Preview rows",
        language="sql",
        text=(
            f"SELECT * FROM {_quote_identifier(table.schema_name)}."
            f"{_quote_identifier(table.table_name)} LIMIT 100"
        ),
    )


def _dynamodb_snippets(table: TableInfo) -> list[PreviewOperationInfo]:
    table_name = _quote_identifier(table.table_name)
    key_column = next((column.name for column in table.columns if column.is_primary_key), None)
    snippets = [
        PreviewOperationInfo(
            label="Preview items",
            language="partiql",
            text=f"SELECT * FROM {table_name} LIMIT 100;",
        )
    ]
    if key_column:
        snippets.append(
            PreviewOperationInfo(
                label="Query by key",
                language="partiql",
                text=f"SELECT * FROM {table_name} WHERE {key_column} = ?;",
            )
        )
    return snippets


def _redis_preview_command(key: str, key_type: str) -> str:
    key_arg = _quote_redis_arg(key)
    match key_type:
        case "string":
            return f"GET {key_arg}"
        case "hash":
            return f"HSCAN {key_arg} 0 COUNT 100"
        case "list":
            return f"LRANGE {key_arg} 0 99"
        case "set":
            return f"SSCAN {key_arg} 0 COUNT 100"
        case "zset":
            return f"ZRANGE {key_arg} 0 99 WITHSCORES"
        case "stream":
            return f"XRANGE {key_arg} - + COUNT 100"
        case _:
            return f"TYPE {key_arg}"


def _quote_identifier(value: str) -> str:
    escaped = value.replace('"', '""')
    return f'"{escaped}"'


def _quote_redis_arg(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _find_table(schema: SchemaInfo, schema_name: str, table_name: str) -> TableInfo:
    for table in schema.tables:
        if table.schema_name == schema_name and table.table_name == table_name:
            return table
    raise NotFoundError("Table", f"{schema_name}.{table_name}")


def _build_relationships(
    schema: SchemaInfo,
    schema_name: str,
    table_name: str,
) -> TableRelationshipsInfo:
    outgoing: dict[tuple[str, str, str, str, str | None], list[RelationshipColumnInfo]] = {}
    incoming: dict[tuple[str, str, str, str, str | None], list[RelationshipColumnInfo]] = {}

    for table in schema.tables:
        for column in table.columns:
            if not column.foreign_key:
                continue
            target_schema_name, target_table_name, target_column_name = _parse_foreign_key(
                column.foreign_key
            )
            relationship_key = (
                table.schema_name,
                table.table_name,
                target_schema_name,
                target_table_name,
                column.foreign_key_name,
            )
            mapping = RelationshipColumnInfo(
                source_column=column.name,
                target_column=target_column_name,
            )
            if table.schema_name == schema_name and table.table_name == table_name:
                outgoing.setdefault(relationship_key, []).append(mapping)
            if target_schema_name == schema_name and target_table_name == table_name:
                incoming.setdefault(relationship_key, []).append(mapping)

    return TableRelationshipsInfo(
        outgoing=_finalize_relationships(outgoing),
        incoming=_finalize_relationships(incoming),
    )


def _finalize_relationships(
    grouped: dict[tuple[str, str, str, str, str | None], list[RelationshipColumnInfo]],
) -> tuple[TableRelationshipInfo, ...]:
    return tuple(
        sorted(
            (
                TableRelationshipInfo(
                    source_schema_name=source_schema_name,
                    source_table_name=source_table_name,
                    target_schema_name=target_schema_name,
                    target_table_name=target_table_name,
                    constraint_name=constraint_name,
                    column_mappings=tuple(column_mappings),
                )
                for (
                    source_schema_name,
                    source_table_name,
                    target_schema_name,
                    target_table_name,
                    constraint_name,
                ), column_mappings in grouped.items()
            ),
            key=lambda item: (
                item.source_schema_name,
                item.source_table_name,
                item.target_schema_name,
                item.target_table_name,
                item.constraint_name or "",
            ),
        )
    )


def _parse_foreign_key(value: str) -> tuple[str, str, str]:
    parts = value.split(".", maxsplit=2)
    if len(parts) != 3:
        raise ValueError(f"Invalid foreign key reference: {value}")
    return parts[0], parts[1], parts[2]


def _build_erd(
    schema: SchemaInfo,
    focus_table: TableInfo,
    relationships: TableRelationshipsInfo,
) -> TableErdInfo:
    table_lookup = {(table.schema_name, table.table_name): table for table in schema.tables}
    table_keys = {(focus_table.schema_name, focus_table.table_name)}
    edges = [
        _relationship_to_edge(relationship)
        for relationship in (*relationships.outgoing, *relationships.incoming)
    ]
    for relationship in (*relationships.outgoing, *relationships.incoming):
        table_keys.add((relationship.source_schema_name, relationship.source_table_name))
        table_keys.add((relationship.target_schema_name, relationship.target_table_name))

    erd_tables = tuple(
        _to_erd_table(
            table_lookup[key],
            is_focus=key == (focus_table.schema_name, focus_table.table_name),
        )
        for key in sorted(table_keys)
        if key in table_lookup
    )
    return TableErdInfo(
        focus_table_key=_table_key(focus_table.schema_name, focus_table.table_name),
        tables=erd_tables,
        edges=tuple(sorted(edges, key=lambda item: item.id)),
    )


def _relationship_to_edge(relationship: TableRelationshipInfo) -> ErdEdgeInfo:
    edge_id = relationship.constraint_name or (
        f"{_table_key(relationship.source_schema_name, relationship.source_table_name)}"
        f"->{_table_key(relationship.target_schema_name, relationship.target_table_name)}"
    )
    return ErdEdgeInfo(
        id=edge_id,
        source_table_key=_table_key(
            relationship.source_schema_name, relationship.source_table_name
        ),
        target_table_key=_table_key(
            relationship.target_schema_name, relationship.target_table_name
        ),
        constraint_name=relationship.constraint_name,
        column_mappings=relationship.column_mappings,
    )


def _to_erd_table(table: TableInfo, *, is_focus: bool) -> ErdTableInfo:
    return ErdTableInfo(
        schema_name=table.schema_name,
        table_name=table.table_name,
        is_focus=is_focus,
        columns=tuple(
            ErdColumnInfo(
                name=column.name,
                data_type=column.data_type,
                is_primary_key=column.is_primary_key,
                is_foreign_key=column.foreign_key is not None,
            )
            for column in table.columns
        ),
    )


def _table_key(schema_name: str, table_name: str) -> str:
    return f"{schema_name}.{table_name}"
