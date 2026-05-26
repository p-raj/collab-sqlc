/** ClickHouse data types for autocomplete. */

export const CH_DATATYPES = [
    // Integers
    "UInt8", "UInt16", "UInt32", "UInt64", "UInt128", "UInt256",
    "Int8", "Int16", "Int32", "Int64", "Int128", "Int256",

    // Floating point
    "Float32", "Float64",

    // Decimal
    "Decimal", "Decimal32", "Decimal64", "Decimal128", "Decimal256",

    // Boolean
    "Bool",

    // String
    "String", "FixedString",

    // Date/time
    "Date", "Date32", "DateTime", "DateTime64",

    // UUID
    "UUID",

    // Enum
    "Enum8", "Enum16",

    // IP addresses
    "IPv4", "IPv6",

    // Geo
    "Point", "Ring", "Polygon", "MultiPolygon",

    // Composite / parametric
    "Array", "Tuple", "Map", "Nested",
    "Nullable", "LowCardinality",

    // Special
    "Nothing", "JSON", "Object",
    "SimpleAggregateFunction", "AggregateFunction",
] as const;
