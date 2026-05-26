/**
 * Smart variables — typed SQL template parameters.
 *
 * Syntax: {name:type} or {name} (defaults to text).
 * Legacy $name syntax is preserved and treated as raw (unquoted) substitution.
 *
 * Supported types:
 *   text     — auto-quoted string:  'hello'
 *   number   — raw numeric:         42
 *   boolean  — SQL boolean:         TRUE / FALSE
 *   date     — quoted date:         '2024-01-15'
 *   datetime — quoted timestamp:    '2024-01-15 09:30:00'
 *   list     — comma-separated quoted strings for IN(): 'a', 'b', 'c'
 */

import { sanitizeSqlPrefix } from "../sql-completion/core/sanitizer";

export type VariableType = "text" | "number" | "boolean" | "date" | "datetime" | "list";

export const VARIABLE_TYPES: readonly VariableType[] = [
    "text", "number", "boolean", "date", "datetime", "list",
] as const;

export interface SmartVariable {
    name: string;
    type: VariableType;
    /** Original matched token, e.g. "{status:text}" or "$status". */
    token: string;
}

interface VariableMatch extends SmartVariable {
    kind: "smart" | "legacy";
    start: number;
    end: number;
}

// {name:type} or {name}
const SMART_VAR_RE = /\{([a-zA-Z_]\w*)(?::([a-zA-Z]+))?\}/g;

// Legacy $name
const LEGACY_VAR_RE = /\$([a-zA-Z_]\w*)/g;

/**
 * Extract all variable declarations from SQL text.
 * Smart variables ({name:type}) take precedence — if the same name appears
 * as both {name:type} and $name, the smart variable metadata wins.
 */
export function extractSmartVariables(sql: string): SmartVariable[] {
    const seen = new Map<string, SmartVariable>();
    const matches = collectVariableMatches(sql);

    // Smart vars first (higher precedence)
    for (const match of matches) {
        if (match.kind !== "smart") {
            continue;
        }
        if (!seen.has(match.name)) {
            seen.set(match.name, { name: match.name, type: match.type, token: match.token });
        }
    }

    // Legacy vars — skip any already declared as smart
    for (const match of matches) {
        if (match.kind !== "legacy") {
            continue;
        }
        if (!seen.has(match.name)) {
            seen.set(match.name, { name: match.name, type: "text", token: match.token });
        }
    }

    return [...seen.values()];
}

function isVariableType(value: string | undefined): value is VariableType {
    return value !== undefined && (VARIABLE_TYPES as readonly string[]).includes(value);
}

/** Format a raw user value for SQL substitution based on variable type. */
export function formatForSql(value: string, type: VariableType): string {
    const trimmed = value.trim();
    if (trimmed === "") return "NULL";

    switch (type) {
        case "text":
            return `'${escapeSqlString(trimmed)}'`;

        case "number": {
            const num = Number(trimmed);
            if (Number.isNaN(num)) return "NULL";
            return trimmed;
        }

        case "boolean": {
            const lower = trimmed.toLowerCase();
            if (lower === "true" || lower === "1" || lower === "yes") return "TRUE";
            if (lower === "false" || lower === "0" || lower === "no") return "FALSE";
            return "NULL";
        }

        case "date":
            return `'${escapeSqlString(trimmed)}'`;

        case "datetime":
            return `'${escapeSqlString(trimmed)}'`;

        case "list": {
            const items = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
            if (items.length === 0) return "NULL";
            const allNumeric = items.every((item) => !Number.isNaN(Number(item)));
            if (allNumeric) return items.join(", ");
            return items.map((item) => `'${escapeSqlString(item)}'`).join(", ");
        }
    }
}

/** Escape single quotes for SQL string literals. */
function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function collectVariableMatches(sql: string): VariableMatch[] {
    const { sanitized } = sanitizeSqlPrefix(sql);
    const matches: VariableMatch[] = [];

    for (const match of sanitized.matchAll(SMART_VAR_RE)) {
        const name = match[1]!;
        const rawType = match[2]?.toLowerCase();
        const type = isVariableType(rawType) ? rawType : "text";
        const start = match.index ?? 0;
        const token = sql.slice(start, start + match[0].length);
        matches.push({
            kind: "smart",
            name,
            type,
            token,
            start,
            end: start + match[0].length,
        });
    }

    for (const match of sanitized.matchAll(LEGACY_VAR_RE)) {
        const name = match[1]!;
        const start = match.index ?? 0;
        const token = sql.slice(start, start + match[0].length);
        matches.push({
            kind: "legacy",
            name,
            type: "text",
            token,
            start,
            end: start + match[0].length,
        });
    }

    return matches.sort((left, right) => left.start - right.start || left.end - right.end);
}

/**
 * Substitute all variables in SQL with formatted values.
 * Smart variables are formatted by type, while legacy $name tokens are
 * interpolated exactly as entered by the user.
 */
export function substituteSmartVariables(
    sql: string,
    _variables: SmartVariable[],
    values: Record<string, string>,
): string {
    const matches = collectVariableMatches(sql);
    if (matches.length === 0) {
        return sql;
    }

    let result = "";
    let cursor = 0;

    for (const match of matches) {
        result += sql.slice(cursor, match.start);

        const raw = values[match.name] ?? "";
        const replacement = match.kind === "legacy" ? raw : formatForSql(raw, match.type);
        result += replacement;
        cursor = match.end;
    }

    result += sql.slice(cursor);
    return result;
}
