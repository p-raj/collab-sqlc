/** Schema domain types. */

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  default_value: string | null;
  comment: string | null;
  /** FK reference in "schema.table.column" format, or null. */
  foreign_key: string | null;
}

export interface TableInfo {
  schema_name: string;
  table_name: string;
  columns: ColumnInfo[];
  row_count: number | null;
  comment: string | null;
}

export interface SchemaResponse {
  connection_id: string;
  tables: TableInfo[];
  cached: boolean;
}

export type EngineKind = "sql" | "redis" | "dynamodb";

export interface PreviewOperation {
  label: string;
  language: "sql" | "partiql" | "redis-command" | string;
  text: string;
  write_mode_required: boolean;
}

export interface CatalogObject {
  id: string;
  kind: "table" | "key" | string;
  namespace: string;
  name: string;
  display_name: string;
  data_type: string | null;
  metadata: Record<string, unknown>;
}

export interface CatalogObjectsResponse {
  connection_id: string;
  engine_kind: EngineKind;
  objects: CatalogObject[];
  cached: boolean;
  truncated: boolean;
}

/** Grouped by schema name for tree rendering. */
export interface SchemaGroup {
  name: string;
  tables: TableInfo[];
}

export type TableExplorerTabId = string;

export interface RelationshipColumnInfo {
  source_column: string;
  target_column: string;
}

export interface TableRelationshipInfo {
  source_schema_name: string;
  source_table_name: string;
  target_schema_name: string;
  target_table_name: string;
  constraint_name: string | null;
  column_mappings: RelationshipColumnInfo[];
}

export interface TableRelationshipsInfo {
  outgoing: TableRelationshipInfo[];
  incoming: TableRelationshipInfo[];
}

export interface TableIndexInfo {
  name: string;
  columns: string[];
  method: string | null;
  definition: string | null;
  is_unique: boolean;
  is_primary: boolean;
}

export interface TableConstraintInfo {
  name: string;
  kind: string;
  columns: string[];
  referenced_schema_name: string | null;
  referenced_table_name: string | null;
  referenced_columns: string[];
  definition: string | null;
}

export interface TableEnumInfo {
  column_name: string;
  enum_schema_name: string;
  enum_name: string;
  values: string[];
}

export interface TableMetadataPropertyInfo {
  label: string;
  value: string;
}

export interface TableMetadataInfo {
  indexes: TableIndexInfo[];
  constraints: TableConstraintInfo[];
  enums: TableEnumInfo[];
  properties: TableMetadataPropertyInfo[];
}

export interface ErdColumnInfo {
  name: string;
  data_type: string;
  is_primary_key: boolean;
  is_foreign_key: boolean;
}

export interface ErdTableInfo {
  schema_name: string;
  table_name: string;
  is_focus: boolean;
  columns: ErdColumnInfo[];
}

export interface ErdEdgeInfo {
  id: string;
  source_table_key: string;
  target_table_key: string;
  constraint_name: string | null;
  column_mappings: RelationshipColumnInfo[];
}

export interface TableErdInfo {
  focus_table_key: string;
  tables: ErdTableInfo[];
  edges: ErdEdgeInfo[];
}

export interface TableDetailResponse {
  connection_id: string;
  schema_name: string;
  table_name: string;
  table: TableInfo;
  relationships: TableRelationshipsInfo;
  metadata: TableMetadataInfo;
  erd: TableErdInfo;
  cached: boolean;
}

export interface ObjectSection {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  columns: ColumnInfo[];
  indexes: TableIndexInfo[];
  properties: TableMetadataPropertyInfo[];
  relationships: TableRelationshipsInfo | null;
  erd: TableErdInfo | null;
  snippets: PreviewOperation[];
}

export interface ObjectDetailResponse {
  connection_id: string;
  engine_kind: EngineKind;
  object: CatalogObject;
  sections: ObjectSection[];
  preview_operation: PreviewOperation;
  cached: boolean;
}
