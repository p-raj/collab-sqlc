/**
 * SqlStatement — parsed representation of the current SQL statement
 * at the cursor position. Inspired by pgcli's SqlStatement class.
 *
 * Responsibilities:
 *  - Isolate current statement from multi-statement text
 *  - Track word before cursor (the prefix being typed)
 *  - Identify last meaningful token (drives suggestion logic)
 *  - Extract table references with aliases
 *  - Track CTE-local table names
 *  - Detect qualified identifiers (schema.table, alias.column)
 */

import { sanitizeSqlPrefix } from "./sanitizer";
import {
    type Token,
    tokenize,
    extractTableRefs,
    stripCtes,
    isReserved,
    normalizeIdentifier,
} from "./extract-tables";
import type { TableRef } from "./types";

const WORD_AT_END = /([A-Za-z_][A-Za-z0-9_$]*)$/;

export class SqlStatement {
    /** The word being typed at cursor (prefix to filter suggestions). */
    readonly wordBeforeCursor: string;

    /** Fully parsed token list of the text before cursor (after CTE stripping). */
    readonly tokens: Token[];

    /** The last token before the word being typed. Drives suggestion type detection. */
    readonly lastToken: Token | null;

    /** Table references extracted from the statement. */
    readonly tableRefs: TableRef[];

    /** CTE names that are locally available as table references. */
    readonly localTableNames: string[];

    /** Extracted column names for each CTE (lowercase CTE name → column names). */
    readonly cteColumns: Map<string, string[]>;

    /** If cursor is after "qualifier.", this is the qualifier text. */
    readonly qualifier: string | null;

    /** If cursor is after "qualifier.", this stores any schema chain parsed. */
    readonly identifierSchema: string | null;

    /** Whether cursor is inside a string/comment (suppress all completions). */
    readonly suppressed: boolean;

    /** The full text of the current statement (up to cursor). */
    readonly textBeforeCursor: string;

    /** Whether the opening paren is the last token. */
    readonly endsWithParen: boolean;

    constructor(fullText: string, cursorOffset: number) {
        const prefixText = fullText.slice(0, Math.max(0, Math.min(cursorOffset, fullText.length)));
        const scan = sanitizeSqlPrefix(prefixText);

        this.suppressed = scan.suppressed;

        if (scan.suppressed) {
            this.wordBeforeCursor = "";
            this.tokens = [];
            this.lastToken = null;
            this.tableRefs = [];
            this.localTableNames = [];
            this.cteColumns = new Map();
            this.qualifier = null;
            this.identifierSchema = null;
            this.textBeforeCursor = "";
            this.endsWithParen = false;
            return;
        }

        const currentRaw = prefixText.slice(scan.statementStart);
        const currentSanitized = scan.sanitized.slice(scan.statementStart);

        // Extract word being typed
        const wordMatch = currentRaw.match(WORD_AT_END);
        this.wordBeforeCursor = wordMatch?.[1] ?? "";

        // Text before the word being typed
        const prefixLen = this.wordBeforeCursor.length;
        const beforeWordRaw = currentRaw.slice(0, currentRaw.length - prefixLen);
        const beforeWordSanitized = currentSanitized.slice(0, currentSanitized.length - prefixLen);

        // Strip completed CTEs
        const stripped = stripCtes(beforeWordRaw, beforeWordSanitized);
        this.localTableNames = stripped.localTableNames;
        this.cteColumns = stripped.cteColumns;
        this.textBeforeCursor = stripped.raw;

        // Tokenize the sanitized text before word
        this.tokens = tokenize(stripped.sanitized);

        const qualifierParts = extractTrailingQualifierParts(this.tokens);
        this.qualifier = qualifierParts ? qualifierParts.join(".") : null;
        this.identifierSchema = qualifierParts
            ? (qualifierParts.length > 1 ? qualifierParts.slice(0, -1).join(".") : qualifierParts[0] ?? null)
            : null;

        const extracted = extractTableRefs(this.tokens, { withSubqueryColumns: true });
        this.tableRefs = extracted.refs;

        // Merge subquery-derived columns into cteColumns for unified resolution
        for (const [alias, cols] of extracted.subqueryColumns) {
            if (!this.cteColumns.has(alias)) {
                this.cteColumns.set(alias, cols);
            }
        }

        // Find last meaningful token
        this.lastToken = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1]! : null;
        this.endsWithParen = this.lastToken?.value === "(" || false;
    }

    isInsert(): boolean {
        return this.tokens.length > 0 && this.tokens[0]!.upper === "INSERT";
    }

    isUpdate(): boolean {
        return this.tokens.length > 0 && this.tokens[0]!.upper === "UPDATE";
    }

    isCreate(): boolean {
        if (this.tokens.length === 0) return false;
        const first = this.tokens[0]!.upper;
        return first === "CREATE" || first === "ALTER" || first === "DROP";
    }

    /** Get tables for the full statement or just before cursor. */
    getTables(scope: "full" | "insert" | "before" = "full"): TableRef[] {
        if (scope === "insert") return this.tableRefs.slice(0, 1);
        if (this.isInsert() && scope === "full") return this.tableRefs.slice(1);
        return this.tableRefs;
    }

    /** Walk backward through tokens to find the previous keyword, optionally skipping n. */
    reduceToPrevKeyword(nSkip = 0): Token | null {
        let skipped = 0;
        for (let i = this.tokens.length - 1; i >= 0; i--) {
            const tok = this.tokens[i]!;
            if (tok.isIdentifier && isReserved(tok.value)) {
                if (skipped >= nSkip) return tok;
                skipped++;
            }
        }
        return null;
    }

    /** Get the last N tokens (useful for context detection). */
    lastNTokens(n: number): Token[] {
        return this.tokens.slice(-n);
    }

    /** Check if a specific keyword appears anywhere in the tokens. */
    hasKeyword(keyword: string): boolean {
        const upper = keyword.toUpperCase();
        return this.tokens.some((t) => t.upper === upper);
    }
}

function extractTrailingQualifierParts(tokens: Token[]): string[] | null {
    if (tokens.length < 2 || tokens[tokens.length - 1]?.value !== ".") {
        return null;
    }

    const parts: string[] = [];
    let index = tokens.length - 2;

    while (index >= 0) {
        const token = tokens[index];
        if (!token?.isIdentifier || isReserved(token.value)) {
            return parts.length > 0 ? parts.reverse() : null;
        }

        parts.push(normalizeIdentifier(token.value));
        index -= 1;

        if (index < 0 || tokens[index]?.value !== ".") {
            return parts.reverse();
        }

        index -= 1;
    }

    return parts.reverse();
}
