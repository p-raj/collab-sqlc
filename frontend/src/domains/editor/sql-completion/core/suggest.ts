/**
 * suggestType() — the core suggestion engine.
 *
 * Takes full SQL text and cursor offset, returns an array of SuggestionHints
 * describing WHAT kind of completions are appropriate. This function has
 * zero knowledge of actual schema data — it only understands SQL grammar.
 *
 * Inspired by pgcli's suggest_based_on_last_token().
 */

import { SqlStatement } from "./statement";
import type {
    SuggestionHint,
} from "./types";

export function suggestType(fullText: string, cursorOffset: number): SuggestionHint[] {
    const stmt = new SqlStatement(fullText, cursorOffset);

    if (stmt.suppressed) return [];

    // Qualified access: alias.col, schema.table
    if (stmt.qualifier) {
        return suggestForQualified(stmt);
    }

    const lastToken = stmt.lastToken;

    // Empty statement or no tokens
    if (!lastToken) {
        return [{ kind: "keyword", lastToken: null }];
    }

    return suggestBasedOnLastToken(lastToken.upper, lastToken, stmt);
}

function suggestForQualified(stmt: SqlStatement): SuggestionHint[] {
    const qualifier = stmt.qualifier!;
    return [
        {
            kind: "qualified",
            qualifier,
            tableRefs: stmt.tableRefs,
            cteColumns: stmt.cteColumns,
        },
    ];
}

function suggestBasedOnLastToken(tokenValue: string, token: { upper: string; value: string; isIdentifier: boolean }, stmt: SqlStatement, depth = 0): SuggestionHint[] {
    // Guard against infinite recursion for unhandled keyword chains
    if (depth > 10) return [{ kind: "keyword", lastToken: null }];

    if (tokenValue === "SELECT" || tokenValue === "DISTINCT") {
        return suggestExpression(stmt, "SELECT");
    }

    // After WHERE, HAVING, BETWEEN → expression context
    if (["WHERE", "HAVING", "BETWEEN"].includes(tokenValue)) {
        return suggestExpression(stmt, "EXPRESSION");
    }

    if (tokenValue === "ORDER" || tokenValue === "GROUP") {
        // "ORDER" alone is waiting for "BY", suggest keyword
        return [{ kind: "keyword", lastToken: tokenValue }];
    }

    if (tokenValue === "BY") {
        // ORDER BY / GROUP BY → expression context
        return suggestExpression(stmt, "EXPRESSION");
    }

    // After FROM, JOIN, INTO, UPDATE, COPY, TRUNCATE → table context
    if (isTableIntroducingKeyword(tokenValue)) {
        const schema = stmt.identifierSchema;
        const hints: SuggestionHint[] = [];

        if (!schema) {
            hints.push({ kind: "schema" });
        }

        if (tokenValue === "FROM" || isJoinToken(tokenValue)) {
            hints.push({
                kind: "table",
                schema,
                localTableNames: stmt.localTableNames,
            });

            if (isJoinToken(tokenValue) && allowJoin(stmt)) {
                hints.push({
                    kind: "join",
                    tableRefs: stmt.getTables("before"),
                    schema,
                });
            }
        } else if (tokenValue === "TRUNCATE") {
            hints.push({ kind: "table", schema, localTableNames: [] });
        } else {
            hints.push({ kind: "table", schema, localTableNames: stmt.localTableNames });
        }

        return hints;
    }

    // After SET (in UPDATE context) → column suggestions
    if (tokenValue === "SET") {
        if (stmt.isUpdate()) {
            return [
                {
                    kind: "column",
                    tableRefs: stmt.getTables(),
                    localTableNames: stmt.localTableNames,
                    qualifiable: false,
                    context: null,
                },
            ];
        }
        return [{ kind: "keyword", lastToken: "SET" }];
    }

    // After ON → join condition or general context
    if (tokenValue === "ON") {
        return suggestOnContext(stmt);
    }

    // After USING followed by ( → shared column context
    if (tokenValue === "(") {
        return suggestAfterParen(stmt);
    }

    // After AS → don't suggest (alias being typed)
    if (tokenValue === "AS") {
        return [];
    }

    // After comma or AND/OR → continue previous context
    if (tokenValue === "," || tokenValue === "AND" || tokenValue === "OR") {
        return suggestAfterContinuation(stmt);
    }

    // After = → SET search_path = schema, or general continuation
    if (tokenValue === "=") {
        if (isSetSearchPathContext(stmt)) return [{ kind: "schema" }];
        return suggestAfterContinuation(stmt);
    }

    // After comparison / arithmetic operators → continue previous expression context
    if (isOperator(tokenValue)) {
        return suggestAfterContinuation(stmt);
    }

    // After closing paren → probably end of subexpr, suggest keywords
    if (tokenValue === ")") {
        return suggestAfterContinuation(stmt);
    }

    // After TABLE, VIEW → object name
    if (tokenValue === "TABLE" || tokenValue === "VIEW") {
        const schema = stmt.identifierSchema;
        if (schema) {
            return [{ kind: "table", schema, localTableNames: [] }];
        }
        return [
            { kind: "schema" },
            { kind: "table", schema: null, localTableNames: [] },
        ];
    }

    // After FUNCTION → function name
    if (tokenValue === "FUNCTION") {
        if (stmt.isCreate()) {
            const schema = stmt.identifierSchema;
            const hints: SuggestionHint[] = [];
            if (!schema) hints.push({ kind: "schema" });
            hints.push({ kind: "function", schema, usage: "signature" });
            return hints;
        }
        return [];
    }

    // After COLUMN → columns of the table
    if (tokenValue === "COLUMN") {
        return [
            {
                kind: "column",
                tableRefs: stmt.getTables(),
                localTableNames: stmt.localTableNames,
                qualifiable: false,
                context: null,
            },
        ];
    }

    // After :: or TYPE → datatype suggestions
    if (tokenValue === "::" || tokenValue === "TYPE") {
        const schema = stmt.identifierSchema;
        const hints: SuggestionHint[] = [
            { kind: "datatype", schema },
            { kind: "table", schema, localTableNames: [] },
        ];
        if (!schema) hints.push({ kind: "schema" });
        return hints;
    }

    // DDL keywords → sub-keyword suggestions
    if (["ALTER", "CREATE", "DROP"].includes(tokenValue)) {
        return [{ kind: "keyword", lastToken: tokenValue }];
    }

    // After SCHEMA → schema name
    if (tokenValue === "SCHEMA") {
        return [{ kind: "schema" }];
    }

    // After RETURNING → columns of the target table
    if (tokenValue === "RETURNING") {
        const tables = stmt.isInsert() ? stmt.getTables("insert") : stmt.getTables();
        return [
            {
                kind: "column",
                tableRefs: tables,
                localTableNames: stmt.localTableNames,
                qualifiable: true,
                context: null,
            },
            { kind: "function", schema: null, usage: "expression" },
            { kind: "keyword", lastToken: "SELECT" },
        ];
    }

    // After VALUES → hint that we're in values context
    if (tokenValue === "VALUES") {
        return [{ kind: "keyword", lastToken: "VALUES" }];
    }

    // After LIMIT/OFFSET → no special suggestions (numeric context)
    if (tokenValue === "LIMIT" || tokenValue === "OFFSET") {
        return [{ kind: "keyword", lastToken: tokenValue }];
    }

    // If it's a known keyword we haven't handled → walk backward
    if (token.isIdentifier && isReservedKeyword(tokenValue)) {
        const prev = stmt.reduceToPrevKeyword(1);
        if (prev) {
            return suggestBasedOnLastToken(prev.upper, prev, stmt, depth + 1);
        }
        return [{ kind: "keyword", lastToken: tokenValue }];
    }

    // After an identifier (not keyword) → check special contexts
    if (token.isIdentifier) {
        if (tokenValue === "TO" && isSetSearchPathContext(stmt)) {
            return [{ kind: "schema" }];
        }
        // Inside OVER () after column → suggest sort direction + more OVER keywords
        if (isInsideOverClause(stmt)) {
            return suggestOverContinuation(stmt);
        }
        // Inside CREATE TABLE/FUNCTION paren, after column/arg name → datatype
        if (isInsideDdlColumnDef(stmt)) {
            const schema = stmt.identifierSchema;
            const hints: SuggestionHint[] = [
                { kind: "datatype", schema },
            ];
            if (!schema) hints.push({ kind: "schema" });
            return hints;
        }
        return [{ kind: "keyword", lastToken: null }];
    }

    return [{ kind: "keyword", lastToken: null }];
}

function suggestExpression(stmt: SqlStatement, keywordContext: string): SuggestionHint[] {
    const tables = stmt.getTables();
    return [
        {
            kind: "column",
            tableRefs: tables,
            localTableNames: stmt.localTableNames,
            qualifiable: true,
            context: null,
        },
        { kind: "function", schema: null, usage: "expression" },
        { kind: "keyword", lastToken: keywordContext },
    ];
}

function suggestOnContext(stmt: SqlStatement): SuggestionHint[] {
    const tables = stmt.getTables("before");
    const aliases = tables.map((t) => t.alias ?? t.name);

    const hints: SuggestionHint[] = [];

    if (allowJoinCondition(stmt)) {
        hints.push({
            kind: "join-condition",
            tableRefs: tables,
            parent: tables.length > 0 ? tables[tables.length - 1]! : null,
        });
    }

    hints.push({ kind: "alias", aliases });

    return hints;
}

function suggestAfterParen(stmt: SqlStatement): SuggestionHint[] {
    // Check for USING ( → shared column context
    const tokens = stmt.tokens;
    const parenIdx = tokens.length - 1;

    if (parenIdx >= 1 && tokens[parenIdx - 1]?.upper === "USING") {
        return [
            {
                kind: "column",
                tableRefs: stmt.getTables("before"),
                localTableNames: stmt.localTableNames,
                qualifiable: false,
                context: null,
            },
        ];
    }

    // OVER ( → window clause keywords (PARTITION BY, ORDER BY) + columns
    if (parenIdx >= 1 && tokens[parenIdx - 1]?.upper === "OVER") {
        return suggestOverClause(stmt);
    }

    // Check for INSERT INTO table ( → column list (but not VALUES ()
    if (stmt.isInsert() && !stmt.hasKeyword("VALUES") && !stmt.hasKeyword("SELECT")) {
        return [
            {
                kind: "column",
                tableRefs: stmt.getTables("insert"),
                localTableNames: [],
                qualifiable: false,
                context: "insert",
            },
        ];
    }

    // VALUES ( → positional value hint + expression context
    // Also handles multi-row: VALUES (...), (|
    if (stmt.isInsert() && isInValuesContext(stmt)) {
        return suggestValuesPosition(stmt, 0);
    }

    // EXISTS( → keyword-only (expect SELECT subquery)
    if (parenIdx >= 1 && tokens[parenIdx - 1]?.upper === "EXISTS") {
        return [{ kind: "keyword", lastToken: "EXISTS" }];
    }

    // Check for WHERE ... ( → subquery or expression
    // Default: suggest expression (functions, columns, keywords for subquery)
    return suggestExpression(stmt, "SELECT");
}

function suggestAfterContinuation(stmt: SqlStatement): SuggestionHint[] {
    // SET search_path TO public, | → continue suggesting schemas
    if (isSetSearchPathContext(stmt)) return [{ kind: "schema" }];

    // Special case: comma inside INSERT column list → stay in insert column context
    if (stmt.isInsert() && isInsideInsertColumnList(stmt)) {
        return [
            {
                kind: "column",
                tableRefs: stmt.getTables("insert"),
                localTableNames: [],
                qualifiable: false,
                context: "insert",
            },
        ];
    }

    // Comma inside OVER () → suggest more columns (PARTITION BY col1, col2)
    if (isInsideOverClause(stmt)) {
        return suggestExpression(stmt, "EXPRESSION");
    }

    // Comma inside VALUES () → track position for positional hints
    if (stmt.isInsert() && isInValuesContext(stmt)) {
        const position = countValuesPosition(stmt);
        return suggestValuesPosition(stmt, position);
    }

    // Walk backward to find the establishing keyword (skip continuation tokens and operators)
    for (let skip = 0; skip < stmt.tokens.length; skip++) {
        const prev = stmt.reduceToPrevKeyword(skip);
        if (!prev) break;
        if (["AND", "OR", ",", "="].includes(prev.upper)) continue;
        return suggestBasedOnLastToken(prev.upper, prev, stmt, 0);
    }
    return [{ kind: "keyword", lastToken: null }];
}

/** Detect SET search_path TO/= context by scanning for the pattern in tokens. */
function isSetSearchPathContext(stmt: SqlStatement): boolean {
    const tokens = stmt.tokens;
    for (let i = 0; i < tokens.length - 1; i++) {
        if (
            tokens[i]!.upper === "SET" &&
            tokens[i + 1]!.upper === "SEARCH_PATH"
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Detect CREATE TABLE/FUNCTION paren context where a column or argument name
 * has been typed and needs a datatype.
 * Patterns: CREATE TABLE foo (col_name |, CREATE FUNCTION foo(arg |
 */
function isInsideDdlColumnDef(stmt: SqlStatement): boolean {
    if (!stmt.isCreate()) return false;

    const tokens = stmt.tokens;
    // Must have TABLE or FUNCTION keyword
    const hasDdlObject = tokens.some(
        (t) => t.upper === "TABLE" || t.upper === "FUNCTION",
    );
    if (!hasDdlObject) return false;

    // Must be inside an unclosed paren
    let depth = 0;
    for (const t of tokens) {
        if (t.value === "(") depth++;
        else if (t.value === ")") depth--;
    }
    if (depth <= 0) return false;

    // The last token should be a plain identifier (column/arg name)
    const last = tokens[tokens.length - 1];
    if (!last?.isIdentifier) return false;
    if (isReservedKeyword(last.upper)) return false;

    // Check that the token before the identifier is ( or , (start of a new column def)
    // This avoids triggering after "col_name datatype" where we already typed the type
    for (let i = tokens.length - 2; i >= 0; i--) {
        const prev = tokens[i]!;
        if (prev.value === "(" || prev.value === ",") return true;
        // Skip other identifiers only if they could be constraint keywords like NOT NULL
        // If we find another plain identifier, it means we're past the datatype already
        if (prev.isIdentifier && !isReservedKeyword(prev.upper)) return false;
        // Reserved keywords between ( and identifier are fine (e.g. CONSTRAINT)
        if (prev.isIdentifier && isReservedKeyword(prev.upper)) continue;
        // Any other token means we're not in a column name position
        return false;
    }
    return false;
}

// -------------------------------------------------------------------
// Window function OVER () clause helpers
// -------------------------------------------------------------------

/**
 * Detect if the cursor is inside an OVER (...) clause by scanning for
 * an unmatched '(' preceded by 'OVER'.
 */
function isInsideOverClause(stmt: SqlStatement): boolean {
    let depth = 0;
    for (let i = stmt.tokens.length - 1; i >= 0; i--) {
        const tok = stmt.tokens[i]!;
        if (tok.value === ")") { depth++; continue; }
        if (tok.value === "(") {
            if (depth > 0) { depth--; continue; }
            // Found unmatched '(' — check if preceded by OVER
            return i > 0 && stmt.tokens[i - 1]!.upper === "OVER";
        }
    }
    return false;
}

/** Suggest OVER clause keywords (PARTITION BY, ORDER BY) plus columns. */
function suggestOverClause(stmt: SqlStatement): SuggestionHint[] {
    return [
        { kind: "keyword", lastToken: "OVER" },
        {
            kind: "column",
            tableRefs: stmt.getTables(),
            localTableNames: stmt.localTableNames,
            qualifiable: true,
            context: null,
        },
    ];
}

/** After a column/expression inside OVER () → sort direction keywords + more OVER keywords. */
function suggestOverContinuation(stmt: SqlStatement): SuggestionHint[] {
    // Check if we're after ORDER BY (not PARTITION BY) → offer ASC/DESC
    const tokens = stmt.tokens;
    let depth = 0;
    let hasOrderBy = false;
    let hasPartitionBy = false;

    // Scan backward from cursor, inside the OVER paren
    for (let i = tokens.length - 1; i >= 0; i--) {
        const tok = tokens[i]!;
        if (tok.value === ")") { depth++; continue; }
        if (tok.value === "(") {
            if (depth > 0) { depth--; continue; }
            break; // reached the OVER paren
        }
        if (depth === 0 && tok.upper === "ORDER") hasOrderBy = true;
        if (depth === 0 && tok.upper === "PARTITION") hasPartitionBy = true;
    }

    const hints: SuggestionHint[] = [];

    // After ORDER BY col → ASC, DESC, NULLS FIRST/LAST
    if (hasOrderBy) {
        hints.push({ kind: "keyword", lastToken: "ORDER_DIRECTION" });
    }

    // Always offer remaining OVER clause keywords
    // (e.g. if only PARTITION BY given, offer ORDER BY)
    if (!hasOrderBy || !hasPartitionBy) {
        hints.push({ kind: "keyword", lastToken: "OVER" });
    }

    return hints;
}

const OPERATORS = new Set(["<", ">", "+", "-", "*", "/", "!", "|"]);

function isOperator(value: string): boolean {
    return OPERATORS.has(value);
}

// -------------------------------------------------------------------
// INSERT VALUES positional hint helpers
// -------------------------------------------------------------------

/** Check if cursor is inside VALUES (...), including multi-row VALUES (...), (...). */
function isInValuesContext(stmt: SqlStatement): boolean {
    let depth = 0;
    for (let i = stmt.tokens.length - 1; i >= 0; i--) {
        const tok = stmt.tokens[i]!;
        if (tok.value === ")") { depth++; continue; }
        if (tok.value === "(") {
            if (depth > 0) { depth--; continue; }
            // Unmatched '(' — check what's before it
            if (i > 0 && stmt.tokens[i - 1]!.upper === "VALUES") return true;
            // Multi-row: VALUES (...), ( — the token before ( is ','
            // and before that is ')' from a previous row.
            // Walk backward past ',)' pairs to find VALUES.
            let j = i - 1;
            while (j >= 0) {
                const t = stmt.tokens[j]!;
                if (t.value === ",") { j--; continue; }
                if (t.value === ")") {
                    // Skip this completed row
                    let d = 1;
                    j--;
                    while (j >= 0 && d > 0) {
                        if (stmt.tokens[j]!.value === ")") d++;
                        else if (stmt.tokens[j]!.value === "(") d--;
                        j--;
                    }
                    continue;
                }
                // Should be VALUES
                return t.upper === "VALUES";
            }
            return false;
        }
    }
    return false;
}

/** Count the 0-based column position inside VALUES (...) by counting commas at depth 0. */
function countValuesPosition(stmt: SqlStatement): number {
    let depth = 0;
    let commas = 0;
    for (let i = stmt.tokens.length - 1; i >= 0; i--) {
        const tok = stmt.tokens[i]!;
        if (tok.value === ")") { depth++; continue; }
        if (tok.value === "(") {
            if (depth > 0) { depth--; continue; }
            break; // reached the VALUES paren
        }
        if (tok.value === "," && depth === 0) commas++;
    }
    return commas;
}

/** Extract explicit column names from INSERT INTO table (col1, col2, ...) VALUES. */
function extractInsertColumns(stmt: SqlStatement): string[] {
    const tokens = stmt.tokens;
    const columns: string[] = [];

    // Find VALUES keyword, then scan backward for the column list paren
    let valuesIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i]!.upper === "VALUES") { valuesIdx = i; break; }
    }
    if (valuesIdx < 0) return columns;

    // Find the closing ')' before VALUES
    let closeIdx = valuesIdx - 1;
    while (closeIdx >= 0 && tokens[closeIdx]!.value !== ")") closeIdx--;
    if (closeIdx < 0) return columns;

    // Find matching '(' for this ')'
    let depth = 0;
    let openIdx = -1;
    for (let i = closeIdx; i >= 0; i--) {
        if (tokens[i]!.value === ")") depth++;
        else if (tokens[i]!.value === "(") {
            depth--;
            if (depth === 0) { openIdx = i; break; }
        }
    }
    if (openIdx < 0) return columns;

    // Extract identifiers between ( and )
    for (let i = openIdx + 1; i < closeIdx; i++) {
        const tok = tokens[i]!;
        if (tok.isIdentifier && !isReservedKeyword(tok.upper)) {
            columns.push(tok.value.toLowerCase());
        }
    }

    return columns;
}

/** Build hints for a position inside VALUES (...). */
function suggestValuesPosition(stmt: SqlStatement, position: number): SuggestionHint[] {
    const columns = extractInsertColumns(stmt);
    return [
        {
            kind: "values",
            tableRefs: stmt.getTables("insert"),
            columns,
            position,
        },
        { kind: "keyword", lastToken: "VALUES" },
        { kind: "function", schema: null, usage: "expression" },
    ];
}

function isTableIntroducingKeyword(value: string): boolean {
    return ["FROM", "JOIN", "INTO", "UPDATE", "COPY", "TRUNCATE"].includes(value)
        || value.endsWith("JOIN");
}

function isJoinToken(value: string): boolean {
    return value === "JOIN" || value.endsWith("JOIN");
}

const RESERVED_KEYWORD_SET = new Set([
    "ALL", "AND", "ANY", "AS", "ASC", "BY", "CASE", "CHECK", "COLUMN",
    "CONSTRAINT", "CREATE", "CROSS", "DEFAULT", "DELETE", "DESC",
    "DISTINCT", "DROP", "ELSE", "END", "EXCEPT", "EXISTS", "FALSE",
    "FETCH", "FOR", "FOREIGN", "FROM", "FULL", "GRANT", "GROUP",
    "HAVING", "IF", "IN", "INDEX", "INNER", "INSERT", "INTERSECT",
    "INTO", "IS", "JOIN", "KEY", "LEFT", "LIKE", "LIMIT", "NATURAL",
    "NOT", "NULL", "OFFSET", "ON", "OR", "ORDER", "OUTER", "OVER",
    "PARTITION", "PRIMARY",
    "REFERENCES", "RETURNING", "RIGHT", "SELECT", "SET", "TABLE",
    "THEN", "TRUE", "TRUNCATE", "UNION", "UNIQUE", "UPDATE", "USING",
    "VALUES", "WHEN", "WHERE", "WITH", "ALTER", "SCHEMA", "FUNCTION",
    "VIEW", "TYPE", "RECURSIVE", "LATERAL", "BETWEEN", "ILIKE",
]);

function isReservedKeyword(value: string): boolean {
    return RESERVED_KEYWORD_SET.has(value);
}

function allowJoinCondition(stmt: SqlStatement): boolean {
    const last = stmt.lastToken;
    if (!last) return false;
    return ["ON", "AND", "OR"].includes(last.upper);
}

function allowJoin(stmt: SqlStatement): boolean {
    const last = stmt.lastToken;
    if (!last) return false;
    const val = last.upper;
    if (!val.endsWith("JOIN")) return false;

    const previous = stmt.tokens[stmt.tokens.length - 2]?.upper;
    return previous !== "CROSS" && previous !== "NATURAL";
}

/** Check if cursor is inside the column list of INSERT INTO table (...). */
function isInsideInsertColumnList(stmt: SqlStatement): boolean {
    // If VALUES already appeared, the column list is complete — we're in values context
    if (stmt.hasKeyword("VALUES")) return false;

    // Walk backward to find unmatched '(' — if found, check that
    // no VALUES or SELECT keyword appears between '(' and cursor.
    let depth = 0;
    for (let i = stmt.tokens.length - 1; i >= 0; i--) {
        const tok = stmt.tokens[i]!;
        if (tok.value === ")") { depth++; continue; }
        if (tok.value === "(") {
            if (depth > 0) { depth--; continue; }
            // Unmatched '(' — check what's before it
            // If the token before '(' is a table name (not VALUES, not SELECT), we're in column list
            const before = i > 0 ? stmt.tokens[i - 1]!.upper : "";
            return before !== "VALUES" && before !== "SELECT" && before !== "WHERE" && before !== "HAVING";
        }
        if (tok.upper === "VALUES" || tok.upper === "SELECT") return false;
    }
    return false;
}
