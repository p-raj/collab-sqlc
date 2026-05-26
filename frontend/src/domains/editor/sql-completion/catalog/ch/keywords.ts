/** ClickHouse keywords grouped by context for smart suggestion ordering. */

/** Top-level statement starters. */
export const STATEMENT_KEYWORDS = [
    "SELECT", "INSERT", "ALTER", "CREATE", "DROP", "TRUNCATE",
    "WITH", "EXPLAIN", "DESCRIBE", "SHOW", "EXISTS",
    "OPTIMIZE", "RENAME", "ATTACH", "DETACH", "CHECK",
    "KILL", "SET", "USE", "SYSTEM", "GRANT", "REVOKE",
] as const;

/** Keywords valid after SELECT. */
export const SELECT_KEYWORDS = [
    "DISTINCT", "ALL", "AS", "FROM", "WHERE",
    "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET",
    "UNION ALL", "INTERSECT", "EXCEPT",
    "PREWHERE", "FINAL", "SAMPLE",
    "ARRAY JOIN", "LEFT ARRAY JOIN",
    "GLOBAL IN", "GLOBAL NOT IN",
    "CASE", "WHEN", "THEN", "ELSE", "END",
    "EXISTS", "IN", "NOT", "IS", "NULL",
    "BETWEEN", "LIKE", "ILIKE", "NOT LIKE", "NOT ILIKE",
    "AND", "OR", "TRUE", "FALSE",
    "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
    "WITH TIES", "WITH FILL",
    "CROSS JOIN", "INNER JOIN",
    "LEFT JOIN", "RIGHT JOIN", "FULL JOIN",
    "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN",
    "ANTI JOIN", "SEMI JOIN", "ANY JOIN", "ALL JOIN", "ASOF JOIN",
    "GLOBAL JOIN", "FORMAT",
    "INTO OUTFILE", "SETTINGS",
] as const;

/** Keywords valid after CREATE. */
export const CREATE_KEYWORDS = [
    "TABLE", "DATABASE", "VIEW", "MATERIALIZED VIEW",
    "DICTIONARY", "FUNCTION", "LIVE VIEW",
    "ROW POLICY", "QUOTA", "SETTINGS PROFILE",
    "USER", "ROLE",
    "OR REPLACE", "IF NOT EXISTS",
    "ON CLUSTER", "AS",
    "ENGINE", "ORDER BY", "PARTITION BY", "PRIMARY KEY",
    "SAMPLE BY", "TTL", "SETTINGS",
] as const;

/** Keywords valid after ALTER. */
export const ALTER_KEYWORDS = [
    "TABLE", "DATABASE", "VIEW",
    "USER", "ROLE", "ROW POLICY", "QUOTA",
    "ADD COLUMN", "DROP COLUMN", "MODIFY COLUMN", "RENAME COLUMN",
    "CLEAR COLUMN", "COMMENT COLUMN",
    "ADD INDEX", "DROP INDEX", "MATERIALIZE INDEX",
    "ADD PROJECTION", "DROP PROJECTION", "MATERIALIZE PROJECTION",
    "MODIFY ORDER BY", "MODIFY SAMPLE BY", "MODIFY TTL",
    "UPDATE", "DELETE",
    "FREEZE", "UNFREEZE",
    "ON CLUSTER",
] as const;

/** Keywords valid after DROP. */
export const DROP_KEYWORDS = [
    "TABLE", "DATABASE", "VIEW", "MATERIALIZED VIEW",
    "DICTIONARY", "FUNCTION",
    "USER", "ROLE", "ROW POLICY", "QUOTA",
    "IF EXISTS", "ON CLUSTER", "SYNC",
] as const;

/** Keywords valid in WHERE/expression context. */
export const EXPRESSION_KEYWORDS = [
    "AND", "OR", "NOT", "IN", "GLOBAL IN",
    "NOT IN", "GLOBAL NOT IN", "EXISTS",
    "BETWEEN", "LIKE", "ILIKE", "NOT LIKE",
    "IS NULL", "IS NOT NULL",
    "CASE", "WHEN", "THEN", "ELSE", "END",
    "CAST", "IF", "MULTIIF",
    "COALESCE", "NULLIF", "IFNULL",
    "TRUE", "FALSE", "NULL",
    "ANY", "ALL",
] as const;

/** Keywords valid after INSERT. */
export const INSERT_KEYWORDS = [
    "INTO", "VALUES", "FORMAT", "SELECT", "SETTINGS",
] as const;

/** Keywords valid inside OVER (). */
export const OVER_KEYWORDS = [
    "PARTITION BY", "ORDER BY",
    "ROWS BETWEEN", "RANGE BETWEEN",
] as const;

/** Keywords valid after ORDER BY column. */
export const ORDER_DIRECTION_KEYWORDS = [
    "ASC", "DESC", "NULLS FIRST", "NULLS LAST", "WITH FILL",
] as const;

/** Keywords valid after ENGINE =. */
export const ENGINE_KEYWORDS = [
    "MergeTree", "ReplacingMergeTree", "SummingMergeTree",
    "AggregatingMergeTree", "CollapsingMergeTree",
    "VersionedCollapsingMergeTree", "GraphiteMergeTree",
    "ReplicatedMergeTree", "ReplicatedReplacingMergeTree",
    "ReplicatedSummingMergeTree", "ReplicatedAggregatingMergeTree",
    "Distributed", "Memory", "Log", "TinyLog", "StripeLog",
    "Buffer", "Null", "Set", "Join", "URL", "File",
    "MaterializedView", "Dictionary", "Merge", "Kafka",
    "RabbitMQ", "PostgreSQL", "MySQL", "S3",
] as const;

/** Map from last token context to keyword suggestions. */
export function getKeywordsForContext(lastToken: string | null): string[] {
    if (!lastToken) return [...STATEMENT_KEYWORDS];

    switch (lastToken) {
        case "SELECT":
            return [...SELECT_KEYWORDS];
        case "EXPRESSION":
        case "WHERE":
        case "HAVING":
        case "PREWHERE":
        case "BY":
            return [...EXPRESSION_KEYWORDS];
        case "CREATE":
            return [...CREATE_KEYWORDS];
        case "ALTER":
            return [...ALTER_KEYWORDS];
        case "DROP":
            return [...DROP_KEYWORDS];
        case "INSERT":
            return [...INSERT_KEYWORDS];
        case "OVER":
            return [...OVER_KEYWORDS];
        case "ORDER_DIRECTION":
            return [...ORDER_DIRECTION_KEYWORDS];
        case "ENGINE":
            return [...ENGINE_KEYWORDS];
        case "LIMIT":
        case "OFFSET":
            return [];
        default:
            return [...STATEMENT_KEYWORDS];
    }
}
