/**
 * Extract table references (with schema, name, alias) from tokenized SQL.
 * Also handles CTE detection for local table name tracking.
 */

import type { TableRef } from "./types";

const TABLE_CONTEXT_KEYWORDS = new Set([
    "FROM", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "CROSS",
    "INTO", "UPDATE", "TABLE", "TRUNCATE",
]);

const JOIN_KEYWORDS = new Set([
    "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "CROSS",
]);

const CLAUSE_TERMINATORS = new Set([
    "WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET",
    "UNION", "EXCEPT", "INTERSECT", "RETURNING", "SET", "VALUES",
    "ON", "USING",
]);

const RESERVED = new Set([
    "ALL", "AND", "ANY", "AS", "ASC", "BY", "CASE", "CROSS", "DELETE",
    "DESC", "DISTINCT", "ELSE", "END", "EXCEPT", "EXISTS", "FROM",
    "FULL", "GROUP", "HAVING", "IN", "INNER", "INSERT", "INTERSECT",
    "INTO", "IS", "JOIN", "LEFT", "LIKE", "LIMIT", "NOT", "NULL",
    "OFFSET", "ON", "OR", "ORDER", "OUTER", "RETURNING", "RIGHT",
    "SELECT", "SET", "TABLE", "THEN", "TRUNCATE", "UNION", "UPDATE",
    "USING", "VALUES", "WHEN", "WHERE", "WITH", "BETWEEN", "ILIKE",
    "TRUE", "FALSE", "NATURAL", "LATERAL", "RECURSIVE",
]);

export interface Token {
    value: string;
    upper: string;
    isIdentifier: boolean;
}

function isQuotedIdentifier(value: string): boolean {
    return /^"(?:[^"]|"")*"$/.test(value);
}

export function normalizeIdentifier(value: string): string {
    if (isQuotedIdentifier(value)) {
        return value.slice(1, -1).replace(/""/g, '"');
    }
    return value;
}

export function isReserved(word: string): boolean {
    return RESERVED.has(word.toUpperCase());
}

export function isTableKeyword(word: string): boolean {
    return TABLE_CONTEXT_KEYWORDS.has(word.toUpperCase());
}

export function isJoinKeyword(word: string): boolean {
    return JOIN_KEYWORDS.has(word.toUpperCase());
}

export function isClauseTerminator(word: string): boolean {
    return CLAUSE_TERMINATORS.has(word.toUpperCase());
}

export function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const regex = /"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*|::|[(),.;=<>!|+\-*/]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const value = match[0];
        const isIdentifier = /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value) || isQuotedIdentifier(value);
        tokens.push({ value, upper: value.toUpperCase(), isIdentifier });
    }

    return tokens;
}

function readIdentifierChain(tokens: Token[], start: number): { name: string; schema: string | null; endIndex: number } | null {
    const first = tokens[start];
    if (!first?.isIdentifier) return null;

    let name = normalizeIdentifier(first.value);
    let schema: string | null = null;
    let index = start;

    if (tokens[index + 1]?.value === "." && tokens[index + 2]?.isIdentifier) {
        schema = normalizeIdentifier(first.value);
        name = normalizeIdentifier(tokens[index + 2]!.value);
        index += 2;
    }

    return { name, schema, endIndex: index };
}

/** Skip from an opening paren to its matching close. Returns index of ')' or -1. */
function skipParens(tokens: Token[], openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < tokens.length; i++) {
        if (tokens[i]!.value === "(") depth++;
        else if (tokens[i]!.value === ")") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

export interface ExtractedRefs {
    refs: TableRef[];
    subqueryColumns: Map<string, string[]>;
}

export function extractTableRefs(tokens: Token[]): TableRef[];
export function extractTableRefs(tokens: Token[], options: { withSubqueryColumns: true }): ExtractedRefs;
export function extractTableRefs(tokens: Token[], options?: { withSubqueryColumns: true }): TableRef[] | ExtractedRefs {
    const refs: TableRef[] = [];
    const subqueryColumns = new Map<string, string[]>();
    let expectingTable = false;
    let allowComma = false;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;

        if (TABLE_CONTEXT_KEYWORDS.has(token.upper) || (token.upper.endsWith("JOIN") && token.isIdentifier)) {
            expectingTable = true;
            allowComma = token.upper === "FROM";
            continue;
        }

        if (CLAUSE_TERMINATORS.has(token.upper) || token.upper === "SELECT") {
            expectingTable = false;
            allowComma = false;
            continue;
        }

        if (allowComma && token.value === ",") {
            expectingTable = true;
            continue;
        }

        if (!expectingTable) continue;

        if (token.value === "(") {
            // Subquery in FROM: FROM (SELECT ...) alias
            const closeIdx = skipParens(tokens, i);
            if (closeIdx === -1) {
                expectingTable = false;
                allowComma = false;
                continue;
            }
            // Check for alias after closing paren
            let alias: string | null = null;
            let afterClose = closeIdx;
            const nextTok = tokens[closeIdx + 1];
            const afterAs = tokens[closeIdx + 2];
            if (nextTok?.upper === "AS" && afterAs?.isIdentifier && !isReserved(afterAs.value)) {
                alias = normalizeIdentifier(afterAs.value);
                afterClose = closeIdx + 2;
            } else if (nextTok?.isIdentifier && !isReserved(nextTok.value) && nextTok.value !== "ON" && nextTok.value !== "USING") {
                alias = normalizeIdentifier(nextTok.value);
                afterClose = closeIdx + 1;
            }
            if (alias) {
                refs.push({ schema: null, name: alias, alias: null });
                // Extract SELECT columns from the subquery body
                const bodyTokens = tokens.slice(i + 1, closeIdx);
                const bodyText = bodyTokens.map(t => t.value).join(" ");
                const cols = extractSelectColumns(bodyText);
                if (cols.length > 0) {
                    subqueryColumns.set(alias, cols);
                }
            }
            i = afterClose;
            expectingTable = false;
            continue;
        }

        if (!token.isIdentifier || isReserved(token.value)) continue;

        const chain = readIdentifierChain(tokens, i);
        if (!chain) {
            expectingTable = false;
            continue;
        }

        i = chain.endIndex;
        let alias: string | null = null;

        // Function-in-FROM: identifier followed by ( → skip args to matching )
        if (tokens[i + 1]?.value === "(") {
            const closeIdx = skipParens(tokens, i + 1);
            if (closeIdx === -1) { expectingTable = false; continue; }
            i = closeIdx;
        }

        const next = tokens[i + 1];
        const afterAs = tokens[i + 2];

        if (next?.upper === "AS" && afterAs?.isIdentifier && !isReserved(afterAs.value)) {
            alias = normalizeIdentifier(afterAs.value);
            i += 2;
        } else if (next?.isIdentifier && !isReserved(next.value) && next.value !== "ON" && next.value !== "USING") {
            alias = normalizeIdentifier(next.value);
            i += 1;
        }

        refs.push({ schema: chain.schema, name: chain.name, alias });
        expectingTable = false;
    }

    if (options?.withSubqueryColumns) {
        return { refs, subqueryColumns };
    }
    return refs;
}

/**
 * Strip completed CTE definitions from the beginning of a statement,
 * returning CTE names as localTableNames, CTE columns, and the remaining SQL.
 */
export function stripCtes(
    raw: string,
    sanitized: string,
): { raw: string; sanitized: string; localTableNames: string[]; cteColumns: Map<string, string[]> } {
    const localTableNames: string[] = [];
    const cteColumns = new Map<string, string[]>();
    let idx = skipWs(sanitized, 0);

    if (!sanitized.slice(idx).match(/^WITH\b/i)) {
        return { raw, sanitized, localTableNames, cteColumns };
    }
    idx += 4;
    idx = skipWs(sanitized, idx);

    if (sanitized.slice(idx).match(/^RECURSIVE\b/i)) {
        idx += 9;
        idx = skipWs(sanitized, idx);
    }

    while (idx < sanitized.length) {
        const nameMatch = sanitized.slice(idx).match(/^([A-Za-z_][A-Za-z0-9_$]*)/);
        if (!nameMatch) return { raw, sanitized, localTableNames, cteColumns };

        const cteName = nameMatch[1]!;
        localTableNames.push(cteName);
        idx += nameMatch[0].length;
        idx = skipWs(sanitized, idx);

        // Optional explicit column list: cte_name(col1, col2)
        let explicitColumns: string[] | null = null;
        if (sanitized[idx] === "(") {
            const closeIdx = findMatchingParen(sanitized, idx);
            if (closeIdx === -1) return { raw, sanitized, localTableNames: [], cteColumns: new Map() };
            explicitColumns = extractParenColumnList(sanitized, idx, closeIdx);
            idx = skipWs(sanitized, closeIdx + 1);
        }

        if (!sanitized.slice(idx).match(/^AS\b/i)) {
            return { raw, sanitized, localTableNames: [], cteColumns: new Map() };
        }
        idx += 2;
        idx = skipWs(sanitized, idx);

        if (sanitized[idx] !== "(") {
            return { raw, sanitized, localTableNames: [], cteColumns: new Map() };
        }

        const bodyEnd = findMatchingParen(sanitized, idx);
        if (bodyEnd === -1) return { raw, sanitized, localTableNames: [], cteColumns: new Map() };

        // Extract columns: prefer explicit column list, fall back to SELECT list parsing
        const cols = explicitColumns ?? extractSelectColumns(sanitized.slice(idx + 1, bodyEnd));
        if (cols.length > 0) {
            cteColumns.set(cteName.toLowerCase(), cols);
        }

        idx = skipWs(sanitized, bodyEnd + 1);
        if (sanitized[idx] !== ",") {
            return {
                raw: raw.slice(idx),
                sanitized: sanitized.slice(idx),
                localTableNames,
                cteColumns,
            };
        }
        idx = skipWs(sanitized, idx + 1);
    }

    return { raw, sanitized, localTableNames: [], cteColumns: new Map() };
}

function skipWs(text: string, start: number): number {
    let i = start;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    return i;
}

function findMatchingParen(text: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/** Extract comma-separated identifiers from an explicit column list: (col1, col2) */
function extractParenColumnList(text: string, open: number, close: number): string[] {
    const inner = text.slice(open + 1, close).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z_][A-Za-z0-9_$]*$/.test(s));
}

/**
 * Extract output column names from a CTE body's SELECT list.
 * Handles: bare column, table.column, expr AS alias, and *.
 * Stops at the first top-level FROM keyword.
 */
export function extractSelectColumns(body: string): string[] {
    const tokens = tokenize(body);
    const columns: string[] = [];

    // Find SELECT keyword
    let i = 0;
    while (i < tokens.length && tokens[i]!.upper !== "SELECT") i++;
    if (i >= tokens.length) return [];
    i++; // skip SELECT

    // Skip optional DISTINCT / ALL
    if (i < tokens.length && (tokens[i]!.upper === "DISTINCT" || tokens[i]!.upper === "ALL")) i++;

    let depth = 0;
    let lastIdent: string | null = null;

    for (; i < tokens.length; i++) {
        const tok = tokens[i]!;

        // Track paren depth — don't interpret commas/FROM inside function calls
        if (tok.value === "(") { depth++; continue; }
        if (tok.value === ")") { depth--; continue; }
        if (depth > 0) continue;

        // Stop at FROM (top-level)
        if (tok.upper === "FROM") {
            if (lastIdent) columns.push(lastIdent);
            break;
        }

        // Comma separates select items
        if (tok.value === ",") {
            if (lastIdent) columns.push(lastIdent);
            lastIdent = null;
            continue;
        }

        // AS keyword — next identifier is the alias
        if (tok.upper === "AS") {
            const next = tokens[i + 1];
            if (next?.isIdentifier && !isReserved(next.value)) {
                lastIdent = normalizeIdentifier(next.value);
                i++; // skip the alias token
            }
            continue;
        }

        // Dot-qualified: take the part after the dot
        if (tok.value === "." && tokens[i + 1]?.isIdentifier) {
            lastIdent = normalizeIdentifier(tokens[i + 1]!.value);
            i++; // skip the column token
            continue;
        }

        // Star — we can't resolve * to column names without catalog knowledge
        if (tok.value === "*") {
            lastIdent = null;
            continue;
        }

        // Identifier — potential column name (may be overridden by AS)
        if (tok.isIdentifier && !isReserved(tok.value)) {
            lastIdent = normalizeIdentifier(tok.value);
        }
    }

    // If we hit end of tokens without FROM (e.g. SELECT-only CTE)
    if (lastIdent && !columns.includes(lastIdent)) {
        columns.push(lastIdent);
    }

    return columns;
}
