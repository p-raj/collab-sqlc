/**
 * DBML text → structured JSON parser.
 *
 * Parses DBML (Database Markup Language) into a structured JSON format
 * optimized for LLM context. Each table, enum, and ref becomes a separate
 * key so the vendor's context pruning preserves granularity.
 */

export interface DbmlField {
  name: string;
  type: string;
  pk?: boolean;
  unique?: boolean;
  not_null?: boolean;
  increment?: boolean;
  default?: string;
  note?: string;
  ref?: string;
}

export interface DbmlIndex {
  columns: string[];
  unique?: boolean;
  pk?: boolean;
  name?: string;
  type?: string;
  note?: string;
}

export interface DbmlTable {
  name: string;
  schema?: string;
  alias?: string;
  note?: string;
  fields: DbmlField[];
  indexes?: DbmlIndex[];
}

export interface DbmlEnum {
  name: string;
  schema?: string;
  values: Array<{ name: string; note?: string }>;
}

export interface DbmlRef {
  name?: string;
  from: { table: string; columns: string[] };
  to: { table: string; columns: string[] };
  type: ">" | "<" | "-" | "<>";
  on_delete?: string;
  on_update?: string;
}

export interface DbmlSchema {
  database_type?: string;
  tables: Record<string, DbmlTable>;
  enums: Record<string, DbmlEnum>;
  refs: DbmlRef[];
}
