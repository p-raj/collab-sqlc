/** Common PostgreSQL data types for autocomplete. */

export const PG_DATATYPES = [
    // Numeric
    "smallint", "integer", "bigint",
    "int2", "int4", "int8",
    "decimal", "numeric",
    "real", "double precision",
    "float4", "float8",
    "serial", "bigserial", "smallserial",
    "money",

    // Character
    "character varying", "varchar",
    "character", "char",
    "text",
    "name",

    // Binary
    "bytea",

    // Date/time
    "timestamp", "timestamp with time zone", "timestamp without time zone",
    "timestamptz",
    "date",
    "time", "time with time zone", "time without time zone",
    "timetz",
    "interval",

    // Boolean
    "boolean", "bool",

    // UUID
    "uuid",

    // JSON
    "json", "jsonb",

    // Array (common patterns)
    "text[]", "integer[]", "bigint[]", "boolean[]", "uuid[]", "jsonb[]",

    // Geometric
    "point", "line", "lseg", "box", "path", "polygon", "circle",

    // Network
    "cidr", "inet", "macaddr", "macaddr8",

    // Bit string
    "bit", "bit varying", "varbit",

    // Text search
    "tsvector", "tsquery",

    // Range
    "int4range", "int8range", "numrange", "tsrange", "tstzrange", "daterange",

    // Other
    "oid", "regclass", "regtype", "regproc",
    "xml",
    "pg_lsn",
    "void",
] as const;
