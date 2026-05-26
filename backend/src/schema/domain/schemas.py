"""Schema domain API schemas."""

from pydantic import Field

from src.shared.domain.schemas import ApiSchema


class ColumnSchema(ApiSchema):
    name: str
    data_type: str
    is_nullable: bool = True
    is_primary_key: bool = False
    default_value: str | None = None
    comment: str | None = None
    foreign_key: str | None = None


class TableSchema(ApiSchema):
    schema_name: str
    table_name: str
    columns: list[ColumnSchema]
    row_count: int | None = None
    comment: str | None = None


class SchemaResponse(ApiSchema):
    connection_id: str
    tables: list[TableSchema]
    cached: bool = False


class RelationshipColumnSchema(ApiSchema):
    source_column: str
    target_column: str


class TableRelationshipSchema(ApiSchema):
    source_schema_name: str
    source_table_name: str
    target_schema_name: str
    target_table_name: str
    constraint_name: str | None = None
    column_mappings: list[RelationshipColumnSchema]


class TableRelationshipsSchema(ApiSchema):
    outgoing: list[TableRelationshipSchema]
    incoming: list[TableRelationshipSchema]


class TableIndexSchema(ApiSchema):
    name: str
    columns: list[str]
    method: str | None = None
    definition: str | None = None
    is_unique: bool = False
    is_primary: bool = False


class TableConstraintSchema(ApiSchema):
    name: str
    kind: str
    columns: list[str]
    referenced_schema_name: str | None = None
    referenced_table_name: str | None = None
    referenced_columns: list[str] = Field(default_factory=list)
    definition: str | None = None


class TableEnumSchema(ApiSchema):
    column_name: str
    enum_schema_name: str
    enum_name: str
    values: list[str]


class TableMetadataPropertySchema(ApiSchema):
    label: str
    value: str


class TableMetadataSchema(ApiSchema):
    indexes: list[TableIndexSchema]
    constraints: list[TableConstraintSchema]
    enums: list[TableEnumSchema]
    properties: list[TableMetadataPropertySchema]


class ErdColumnSchema(ApiSchema):
    name: str
    data_type: str
    is_primary_key: bool = False
    is_foreign_key: bool = False


class ErdTableSchema(ApiSchema):
    schema_name: str
    table_name: str
    is_focus: bool
    columns: list[ErdColumnSchema]


class ErdEdgeSchema(ApiSchema):
    id: str
    source_table_key: str
    target_table_key: str
    constraint_name: str | None = None
    column_mappings: list[RelationshipColumnSchema]


class TableErdSchema(ApiSchema):
    focus_table_key: str
    tables: list[ErdTableSchema]
    edges: list[ErdEdgeSchema]


class TableDetailResponse(ApiSchema):
    connection_id: str
    schema_name: str
    table_name: str
    table: TableSchema
    relationships: TableRelationshipsSchema
    metadata: TableMetadataSchema
    erd: TableErdSchema
    cached: bool = False
