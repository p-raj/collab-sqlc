from src.connections.drivers.base import (
    ColumnInfo,
    RelationshipColumnInfo,
    SchemaInfo,
    TableDetailInfo,
    TableInfo,
    TableMetadataInfo,
    TableMetadataPropertyInfo,
    TableRelationshipInfo,
    TableRelationshipsInfo,
)
from src.schema.service.schema_service import (
    _build_erd,
    _build_relationships,
    _deserialize_table_detail,
    _serialize_table_detail,
)


def test_build_relationships_collects_incoming_and_outgoing_edges() -> None:
    schema = SchemaInfo(
        tables=[
            TableInfo(
                schema_name="public",
                table_name="users",
                columns=(
                    ColumnInfo(name="id", data_type="uuid", is_primary_key=True),
                    ColumnInfo(
                        name="role_id",
                        data_type="uuid",
                        foreign_key="public.roles.id",
                        foreign_key_name="users_role_id_fkey",
                    ),
                ),
            ),
            TableInfo(
                schema_name="public",
                table_name="roles",
                columns=(ColumnInfo(name="id", data_type="uuid", is_primary_key=True),),
            ),
            TableInfo(
                schema_name="public",
                table_name="orders",
                columns=(
                    ColumnInfo(name="id", data_type="uuid", is_primary_key=True),
                    ColumnInfo(
                        name="user_id",
                        data_type="uuid",
                        foreign_key="public.users.id",
                        foreign_key_name="orders_user_id_fkey",
                    ),
                ),
            ),
        ]
    )

    relationships = _build_relationships(schema, "public", "users")

    assert len(relationships.outgoing) == 1
    assert relationships.outgoing[0].target_table_name == "roles"
    assert relationships.outgoing[0].column_mappings == (
        RelationshipColumnInfo(source_column="role_id", target_column="id"),
    )

    assert len(relationships.incoming) == 1
    assert relationships.incoming[0].source_table_name == "orders"
    assert relationships.incoming[0].column_mappings == (
        RelationshipColumnInfo(source_column="user_id", target_column="id"),
    )


def test_build_erd_includes_focus_table_and_direct_neighbors() -> None:
    focus_table = TableInfo(
        schema_name="public",
        table_name="users",
        columns=(
            ColumnInfo(name="id", data_type="uuid", is_primary_key=True),
            ColumnInfo(
                name="role_id",
                data_type="uuid",
                foreign_key="public.roles.id",
                foreign_key_name="users_role_id_fkey",
            ),
        ),
    )
    relationships = TableRelationshipsInfo(
        outgoing=(
            TableRelationshipInfo(
                source_schema_name="public",
                source_table_name="users",
                target_schema_name="public",
                target_table_name="roles",
                constraint_name="users_role_id_fkey",
                column_mappings=(
                    RelationshipColumnInfo(source_column="role_id", target_column="id"),
                ),
            ),
        ),
        incoming=(
            TableRelationshipInfo(
                source_schema_name="public",
                source_table_name="orders",
                target_schema_name="public",
                target_table_name="users",
                constraint_name="orders_user_id_fkey",
                column_mappings=(
                    RelationshipColumnInfo(source_column="user_id", target_column="id"),
                ),
            ),
        ),
    )
    schema = SchemaInfo(
        tables=[
            focus_table,
            TableInfo(
                schema_name="public",
                table_name="roles",
                columns=(ColumnInfo(name="id", data_type="uuid", is_primary_key=True),),
            ),
            TableInfo(
                schema_name="public",
                table_name="orders",
                columns=(
                    ColumnInfo(name="id", data_type="uuid", is_primary_key=True),
                    ColumnInfo(
                        name="user_id",
                        data_type="uuid",
                        foreign_key="public.users.id",
                        foreign_key_name="orders_user_id_fkey",
                    ),
                ),
            ),
        ]
    )

    erd = _build_erd(schema, focus_table, relationships)

    assert erd.focus_table_key == "public.users"
    assert {f"{table.schema_name}.{table.table_name}" for table in erd.tables} == {
        "public.orders",
        "public.roles",
        "public.users",
    }
    assert len(erd.edges) == 2
    assert next(table for table in erd.tables if table.is_focus).table_name == "users"


def test_table_detail_cache_round_trip_preserves_nested_structures() -> None:
    detail = TableDetailInfo(
        table=TableInfo(
            schema_name="public",
            table_name="users",
            columns=(
                ColumnInfo(
                    name="id",
                    data_type="uuid",
                    is_primary_key=True,
                ),
            ),
        ),
        relationships=TableRelationshipsInfo(),
        metadata=TableMetadataInfo(
            properties=(TableMetadataPropertyInfo(label="Engine", value="MergeTree"),),
        ),
        erd=_build_erd(
            SchemaInfo(
                tables=[
                    TableInfo(
                        schema_name="public",
                        table_name="users",
                        columns=(ColumnInfo(name="id", data_type="uuid", is_primary_key=True),),
                    )
                ]
            ),
            TableInfo(
                schema_name="public",
                table_name="users",
                columns=(ColumnInfo(name="id", data_type="uuid", is_primary_key=True),),
            ),
            TableRelationshipsInfo(),
        ),
    )

    round_tripped = _deserialize_table_detail(_serialize_table_detail(detail))

    assert round_tripped.table.table_name == "users"
    assert round_tripped.metadata.properties[0].label == "Engine"
    assert round_tripped.erd.focus_table_key == "public.users"
