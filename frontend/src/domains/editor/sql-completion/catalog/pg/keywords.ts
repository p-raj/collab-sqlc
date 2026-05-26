/** PostgreSQL keywords grouped by context for smart suggestion ordering. */

/** Top-level statement starters. */
export const STATEMENT_KEYWORDS = [
    "SELECT", "INSERT", "UPDATE", "DELETE", "WITH",
    "CREATE", "ALTER", "DROP", "TRUNCATE",
    "EXPLAIN", "ANALYZE", "VACUUM", "REINDEX",
    "GRANT", "REVOKE", "BEGIN", "COMMIT", "ROLLBACK",
    "SAVEPOINT", "COPY", "DO", "SET", "SHOW", "RESET",
] as const;

/** Keywords valid after SELECT. */
export const SELECT_KEYWORDS = [
    "DISTINCT", "ALL", "AS", "FROM", "WHERE",
    "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET",
    "UNION", "UNION ALL", "INTERSECT", "EXCEPT",
    "CASE", "WHEN", "THEN", "ELSE", "END",
    "EXISTS", "IN", "NOT", "IS", "NULL",
    "BETWEEN", "LIKE", "ILIKE", "SIMILAR TO",
    "AND", "OR", "TRUE", "FALSE",
    "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
    "FETCH", "FOR UPDATE", "FOR SHARE",
    "LATERAL", "CROSS JOIN", "INNER JOIN",
    "LEFT JOIN", "RIGHT JOIN", "FULL JOIN",
    "LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN",
    "NATURAL JOIN",
] as const;

/** Keywords valid after CREATE. */
export const CREATE_KEYWORDS = [
    "TABLE", "INDEX", "VIEW", "MATERIALIZED VIEW",
    "FUNCTION", "PROCEDURE", "TRIGGER", "SEQUENCE",
    "SCHEMA", "DATABASE", "ROLE", "USER",
    "TYPE", "EXTENSION", "POLICY",
    "UNIQUE INDEX", "TEMPORARY TABLE", "TEMP TABLE",
    "OR REPLACE", "IF NOT EXISTS",
] as const;

/** Keywords valid after ALTER. */
export const ALTER_KEYWORDS = [
    "TABLE", "INDEX", "VIEW", "MATERIALIZED VIEW",
    "FUNCTION", "PROCEDURE", "SEQUENCE",
    "SCHEMA", "DATABASE", "ROLE", "USER",
    "TYPE", "EXTENSION", "POLICY",
    "COLUMN", "CONSTRAINT",
] as const;

/** Keywords valid after DROP. */
export const DROP_KEYWORDS = [
    "TABLE", "INDEX", "VIEW", "MATERIALIZED VIEW",
    "FUNCTION", "PROCEDURE", "TRIGGER", "SEQUENCE",
    "SCHEMA", "DATABASE", "ROLE", "USER",
    "TYPE", "EXTENSION", "POLICY",
    "IF EXISTS", "CASCADE", "RESTRICT",
] as const;

/** Keywords valid in WHERE/expression context. */
export const EXPRESSION_KEYWORDS = [
    "AND", "OR", "NOT", "IN", "EXISTS",
    "BETWEEN", "LIKE", "ILIKE", "SIMILAR TO",
    "IS NULL", "IS NOT NULL",
    "IS TRUE", "IS FALSE",
    "IS DISTINCT FROM", "IS NOT DISTINCT FROM",
    "ANY", "ALL", "SOME",
    "CASE", "WHEN", "THEN", "ELSE", "END",
    "CAST", "NULLIF", "COALESCE", "GREATEST", "LEAST",
    "TRUE", "FALSE", "NULL",
] as const;

/** Keywords valid after SET. */
export const SET_KEYWORDS = [
    "search_path", "statement_timeout", "lock_timeout",
    "work_mem", "timezone", "client_encoding",
    "default_transaction_isolation",
] as const;

/** Keywords valid after VALUES. */
export const VALUES_KEYWORDS = [
    "DEFAULT", "NULL", "TRUE", "FALSE",
] as const;

/** Keywords valid inside OVER (). */
export const OVER_KEYWORDS = [
    "PARTITION BY", "ORDER BY",
] as const;

/** Keywords valid after ORDER BY column inside OVER (). */
export const ORDER_DIRECTION_KEYWORDS = [
    "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
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
        case "BY": // ORDER BY, GROUP BY
            return [...EXPRESSION_KEYWORDS];
        case "CREATE":
            return [...CREATE_KEYWORDS];
        case "ALTER":
            return [...ALTER_KEYWORDS];
        case "DROP":
            return [...DROP_KEYWORDS];
        case "SET":
            return [...SET_KEYWORDS];
        case "VALUES":
            return [...VALUES_KEYWORDS];
        case "OVER":
            return [...OVER_KEYWORDS];
        case "ORDER_DIRECTION":
            return [...ORDER_DIRECTION_KEYWORDS];
        case "LIMIT":
        case "OFFSET":
            return []; // numeric context
        default:
            return [...STATEMENT_KEYWORDS];
    }
}
