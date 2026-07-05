"""Schema explorer API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.auth.api.dependencies import get_current_user
from src.auth.domain.schemas import CurrentUser
from src.connections.api.dependencies import get_connection_service
from src.connections.drivers.base import TableDetailInfo, TableInfo, TableRelationshipInfo
from src.connections.engine_registry import get_database_engine
from src.connections.service.connection_service import ConnectionService
from src.schema.api.dependencies import get_schema_service
from src.schema.domain.explorer_models import (
    CatalogObjectInfo,
    ObjectDetailInfo,
    ObjectSectionInfo,
    PreviewOperationInfo,
)
from src.schema.domain.schemas import (
    CatalogObjectSchema,
    CatalogObjectsResponse,
    ColumnSchema,
    ErdColumnSchema,
    ErdEdgeSchema,
    ErdTableSchema,
    ObjectDetailResponse,
    ObjectSectionSchema,
    PreviewOperationSchema,
    RelationshipColumnSchema,
    SchemaResponse,
    TableConstraintSchema,
    TableDetailResponse,
    TableEnumSchema,
    TableErdSchema,
    TableIndexSchema,
    TableMetadataPropertySchema,
    TableMetadataSchema,
    TableRelationshipSchema,
    TableRelationshipsSchema,
    TableSchema,
)
from src.schema.service.schema_service import SchemaService

router = APIRouter(prefix="/schema", tags=["schema"])


@router.get("/{connection_id}", response_model=SchemaResponse)
async def get_schema(
    connection_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    schema_service: Annotated[SchemaService, Depends(get_schema_service)],
    refresh: bool = Query(default=False, description="Force cache refresh"),
) -> SchemaResponse:
    conn_model = await conn_service.get_for_user(connection_id, user.id, user.role)
    schema_info, was_cached = await schema_service.get_schema(conn_model, force_refresh=refresh)

    tables = [
        TableSchema(
            schema_name=t.schema_name,
            table_name=t.table_name,
            columns=[
                ColumnSchema(
                    name=c.name,
                    data_type=c.data_type,
                    is_nullable=c.is_nullable,
                    is_primary_key=c.is_primary_key,
                    default_value=c.default_value,
                    comment=c.comment,
                    foreign_key=c.foreign_key,
                )
                for c in t.columns
            ],
            row_count=t.row_count,
            comment=t.comment,
        )
        for t in schema_info.tables
    ]

    return SchemaResponse(
        connection_id=connection_id,
        tables=tables,
        cached=was_cached,
    )


@router.get("/{connection_id}/objects", response_model=CatalogObjectsResponse)
async def get_catalog_objects(
    connection_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    schema_service: Annotated[SchemaService, Depends(get_schema_service)],
    refresh: bool = Query(default=False, description="Force cache refresh"),
) -> CatalogObjectsResponse:
    conn_model = await conn_service.get_for_user(connection_id, user.id, user.role)
    objects, was_cached = await schema_service.get_catalog_objects(
        conn_model,
        force_refresh=refresh,
    )
    return CatalogObjectsResponse(
        connection_id=connection_id,
        engine_kind=get_database_engine(conn_model.db_type).engine_kind,
        objects=[_to_catalog_object_schema(item) for item in objects],
        cached=was_cached,
        truncated=conn_model.db_type == "redis" and len(objects) >= 500,
    )


@router.get("/{connection_id}/objects/detail", response_model=ObjectDetailResponse)
async def get_catalog_object_detail(
    connection_id: str,
    object_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    schema_service: Annotated[SchemaService, Depends(get_schema_service)],
    refresh: bool = Query(default=False, description="Force cache refresh"),
) -> ObjectDetailResponse:
    conn_model = await conn_service.get_for_user(connection_id, user.id, user.role)
    detail, was_cached = await schema_service.get_object_detail(
        conn_model,
        object_id,
        force_refresh=refresh,
    )
    return _to_object_detail_response(
        connection_id=connection_id,
        detail=detail,
        cached=was_cached,
    )


@router.get(
    "/{connection_id}/tables/{schema_name}/{table_name}",
    response_model=TableDetailResponse,
)
async def get_table_detail(
    connection_id: str,
    schema_name: str,
    table_name: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    schema_service: Annotated[SchemaService, Depends(get_schema_service)],
    refresh: bool = Query(default=False, description="Force cache refresh"),
) -> TableDetailResponse:
    conn_model = await conn_service.get_for_user(connection_id, user.id, user.role)
    detail, was_cached = await schema_service.get_table_detail(
        conn_model,
        schema_name,
        table_name,
        force_refresh=refresh,
    )
    return _to_table_detail_response(
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        detail=detail,
        cached=was_cached,
    )


@router.delete("/{connection_id}/cache", status_code=204)
async def invalidate_schema_cache(
    connection_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    conn_service: Annotated[ConnectionService, Depends(get_connection_service)],
    schema_service: Annotated[SchemaService, Depends(get_schema_service)],
) -> None:
    await conn_service.get_for_user(connection_id, user.id, user.role)
    await schema_service.invalidate(connection_id)


def _to_table_schema(table: TableInfo) -> TableSchema:
    return TableSchema(
        schema_name=table.schema_name,
        table_name=table.table_name,
        columns=[
            ColumnSchema(
                name=column.name,
                data_type=column.data_type,
                is_nullable=column.is_nullable,
                is_primary_key=column.is_primary_key,
                default_value=column.default_value,
                comment=column.comment,
                foreign_key=column.foreign_key,
            )
            for column in table.columns
        ],
        row_count=table.row_count,
        comment=table.comment,
    )


def _to_catalog_object_schema(item: CatalogObjectInfo) -> CatalogObjectSchema:
    return CatalogObjectSchema(
        id=item.id,
        kind=item.kind,
        namespace=item.namespace,
        name=item.name,
        display_name=item.display_name,
        data_type=item.data_type,
        metadata=item.metadata,
    )


def _to_preview_operation_schema(item: PreviewOperationInfo) -> PreviewOperationSchema:
    return PreviewOperationSchema(
        label=item.label,
        language=item.language,
        text=item.text,
        write_mode_required=item.write_mode_required,
    )


def _to_object_detail_response(
    *,
    connection_id: str,
    detail: ObjectDetailInfo,
    cached: bool,
) -> ObjectDetailResponse:
    return ObjectDetailResponse(
        connection_id=connection_id,
        engine_kind=detail.engine_kind,
        object=_to_catalog_object_schema(detail.object),
        sections=[_to_object_section_schema(item) for item in detail.sections],
        preview_operation=_to_preview_operation_schema(detail.preview_operation),
        cached=cached,
    )


def _to_object_section_schema(item: ObjectSectionInfo) -> ObjectSectionSchema:
    return ObjectSectionSchema(
        id=item.id,
        title=item.title,
        kind=item.kind,
        description=item.description,
        columns=[
            ColumnSchema(
                name=column.name,
                data_type=column.data_type,
                is_nullable=column.is_nullable,
                is_primary_key=column.is_primary_key,
                default_value=column.default_value,
                comment=column.comment,
                foreign_key=column.foreign_key,
            )
            for column in item.columns
        ],
        indexes=[
            TableIndexSchema(
                name=index.name,
                columns=list(index.columns),
                method=index.method,
                definition=index.definition,
                is_unique=index.is_unique,
                is_primary=index.is_primary,
            )
            for index in item.indexes
        ],
        properties=[
            TableMetadataPropertySchema(label=property.label, value=property.value)
            for property in item.properties
        ],
        relationships=(
            TableRelationshipsSchema(
                outgoing=[
                    _to_relationship_schema(relationship)
                    for relationship in item.relationships.outgoing
                ],
                incoming=[
                    _to_relationship_schema(relationship)
                    for relationship in item.relationships.incoming
                ],
            )
            if item.relationships
            else None
        ),
        erd=(
            TableErdSchema(
                focus_table_key=item.erd.focus_table_key,
                tables=[
                    ErdTableSchema(
                        schema_name=table.schema_name,
                        table_name=table.table_name,
                        is_focus=table.is_focus,
                        columns=[
                            ErdColumnSchema(
                                name=column.name,
                                data_type=column.data_type,
                                is_primary_key=column.is_primary_key,
                                is_foreign_key=column.is_foreign_key,
                            )
                            for column in table.columns
                        ],
                    )
                    for table in item.erd.tables
                ],
                edges=[
                    ErdEdgeSchema(
                        id=edge.id,
                        source_table_key=edge.source_table_key,
                        target_table_key=edge.target_table_key,
                        constraint_name=edge.constraint_name,
                        column_mappings=[
                            RelationshipColumnSchema(
                                source_column=mapping.source_column,
                                target_column=mapping.target_column,
                            )
                            for mapping in edge.column_mappings
                        ],
                    )
                    for edge in item.erd.edges
                ],
            )
            if item.erd
            else None
        ),
        snippets=[_to_preview_operation_schema(snippet) for snippet in item.snippets],
    )


def _to_table_detail_response(
    *,
    connection_id: str,
    schema_name: str,
    table_name: str,
    detail: TableDetailInfo,
    cached: bool,
) -> TableDetailResponse:
    return TableDetailResponse(
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        table=_to_table_schema(detail.table),
        relationships=TableRelationshipsSchema(
            outgoing=[_to_relationship_schema(item) for item in detail.relationships.outgoing],
            incoming=[_to_relationship_schema(item) for item in detail.relationships.incoming],
        ),
        metadata=TableMetadataSchema(
            indexes=[
                TableIndexSchema(
                    name=item.name,
                    columns=list(item.columns),
                    method=item.method,
                    definition=item.definition,
                    is_unique=item.is_unique,
                    is_primary=item.is_primary,
                )
                for item in detail.metadata.indexes
            ],
            constraints=[
                TableConstraintSchema(
                    name=item.name,
                    kind=item.kind,
                    columns=list(item.columns),
                    referenced_schema_name=item.referenced_schema_name,
                    referenced_table_name=item.referenced_table_name,
                    referenced_columns=list(item.referenced_columns),
                    definition=item.definition,
                )
                for item in detail.metadata.constraints
            ],
            enums=[
                TableEnumSchema(
                    column_name=item.column_name,
                    enum_schema_name=item.enum_schema_name,
                    enum_name=item.enum_name,
                    values=list(item.values),
                )
                for item in detail.metadata.enums
            ],
            properties=[
                TableMetadataPropertySchema(
                    label=item.label,
                    value=item.value,
                )
                for item in detail.metadata.properties
            ],
        ),
        erd=TableErdSchema(
            focus_table_key=detail.erd.focus_table_key,
            tables=[
                ErdTableSchema(
                    schema_name=item.schema_name,
                    table_name=item.table_name,
                    is_focus=item.is_focus,
                    columns=[
                        ErdColumnSchema(
                            name=column.name,
                            data_type=column.data_type,
                            is_primary_key=column.is_primary_key,
                            is_foreign_key=column.is_foreign_key,
                        )
                        for column in item.columns
                    ],
                )
                for item in detail.erd.tables
            ],
            edges=[
                ErdEdgeSchema(
                    id=item.id,
                    source_table_key=item.source_table_key,
                    target_table_key=item.target_table_key,
                    constraint_name=item.constraint_name,
                    column_mappings=[
                        RelationshipColumnSchema(
                            source_column=mapping.source_column,
                            target_column=mapping.target_column,
                        )
                        for mapping in item.column_mappings
                    ],
                )
                for item in detail.erd.edges
            ],
        ),
        cached=cached,
    )


def _to_relationship_schema(item: TableRelationshipInfo) -> TableRelationshipSchema:
    return TableRelationshipSchema(
        source_schema_name=item.source_schema_name,
        source_table_name=item.source_table_name,
        target_schema_name=item.target_schema_name,
        target_table_name=item.target_table_name,
        constraint_name=item.constraint_name,
        column_mappings=[
            RelationshipColumnSchema(
                source_column=mapping.source_column,
                target_column=mapping.target_column,
            )
            for mapping in item.column_mappings
        ],
    )
