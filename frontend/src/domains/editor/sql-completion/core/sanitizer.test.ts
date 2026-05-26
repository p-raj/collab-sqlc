/**
 * Comprehensive sanitizeSqlPrefix() tests.
 * Tests string/comment/quote stripping while preserving offsets.
 */

import { describe, expect, it } from "vitest";
import { sanitizeSqlPrefix } from "./sanitizer";

function sanitized(sql: string): string {
    return sanitizeSqlPrefix(sql).sanitized;
}

function suppressed(sql: string): boolean {
    return sanitizeSqlPrefix(sql).suppressed;
}

function stmtStart(sql: string): number {
    return sanitizeSqlPrefix(sql).statementStart;
}

// ============================================================================
// String literal handling
// ============================================================================
describe("sanitizer — single-quoted strings", () => {
    it("replaces string content with spaces", () => {
        const result = sanitized("SELECT 'hello' FROM t");
        expect(result).not.toContain("hello");
        expect(result).toContain("FROM");
    });

    it("preserves length (offsets stay aligned)", () => {
        const sql = "SELECT 'hello world' FROM t";
        expect(sanitized(sql).length).toBe(sql.length);
    });

    it("marks incomplete string as suppressed", () => {
        expect(suppressed("SELECT 'hello")).toBe(true);
    });

    it("handles escaped quotes (doubled single quotes)", () => {
        const sql = "SELECT 'it''s a test' FROM t";
        expect(suppressed(sql)).toBe(false);
        expect(sanitized(sql)).toContain("FROM");
    });

    it("marks open after escaped quote as suppressed", () => {
        expect(suppressed("SELECT 'it''s")).toBe(true);
    });

    it("handles empty string literal", () => {
        const sql = "SELECT '' FROM t";
        expect(suppressed(sql)).toBe(false);
        expect(sanitized(sql).length).toBe(sql.length);
    });
});

// ============================================================================
// Double-quoted identifiers
// ============================================================================
describe("sanitizer — double-quoted identifiers", () => {
    it("preserves quoted identifiers for downstream parsing", () => {
        const result = sanitized('SELECT "My Column" FROM t');
        expect(result).toContain('"My Column"');
        expect(result).toContain("FROM");
    });

    it("marks incomplete double-quote as suppressed", () => {
        expect(suppressed('SELECT "incomplete')).toBe(true);
    });

    it("handles escaped double quotes", () => {
        const sql = 'SELECT "with""escape" FROM t';
        expect(suppressed(sql)).toBe(false);
    });

    it("preserves length", () => {
        const sql = 'SELECT "Col Name" FROM t';
        expect(sanitized(sql).length).toBe(sql.length);
    });

    it("preserves quoted schema and table names", () => {
        const sql = 'SELECT * FROM "My Schema"."Orders"';
        const result = sanitized(sql);
        expect(result).toContain('"My Schema"');
        expect(result).toContain('"Orders"');
    });
});

// ============================================================================
// Line comments
// ============================================================================
describe("sanitizer — line comments", () => {
    it("strips line comment content", () => {
        const result = sanitized("SELECT -- this is a comment\n* FROM t");
        expect(result).not.toContain("this is a comment");
        expect(result).toContain("FROM");
    });

    it("marks trailing line comment as suppressed", () => {
        expect(suppressed("SELECT -- comment")).toBe(true);
    });

    it("handles line comment terminated by newline", () => {
        const sql = "SELECT -- comment\n* FROM t";
        expect(suppressed(sql)).toBe(false);
    });

    it("preserves newlines in line comments", () => {
        const sql = "SELECT -- comment\n* FROM t";
        const result = sanitized(sql);
        expect(result).toContain("\n");
        expect(result.length).toBe(sql.length);
    });
});

// ============================================================================
// Block comments
// ============================================================================
describe("sanitizer — block comments", () => {
    it("strips block comment content", () => {
        const result = sanitized("SELECT /* comment */ * FROM t");
        expect(result).not.toContain("comment");
        expect(result).toContain("FROM");
    });

    it("marks unclosed block comment as suppressed", () => {
        expect(suppressed("SELECT /* unclosed")).toBe(true);
    });

    it("handles multi-line block comment", () => {
        const sql = "SELECT /* line1\nline2 */ * FROM t";
        expect(suppressed(sql)).toBe(false);
        expect(sanitized(sql).length).toBe(sql.length);
    });

    it("preserves newlines inside block comments", () => {
        const sql = "SELECT /*\ncomment\n*/ FROM t";
        const result = sanitized(sql);
        expect(result.split("\n")).toHaveLength(3);
    });
});

// ============================================================================
// Dollar-quoted strings
// ============================================================================
describe("sanitizer — dollar-quoted strings", () => {
    it("strips $$ content", () => {
        const result = sanitized("SELECT $$ body $$ FROM t");
        expect(result).not.toContain("body");
    });

    it("marks open $$ as suppressed", () => {
        expect(suppressed("SELECT $$ body")).toBe(true);
    });

    it("handles named dollar-quote tags", () => {
        const sql = "SELECT $fn$ function body $fn$ FROM t";
        expect(suppressed(sql)).toBe(false);
    });

    it("marks open named dollar-quote as suppressed", () => {
        expect(suppressed("SELECT $fn$ function body")).toBe(true);
    });

    it("preserves length with dollar quotes", () => {
        const sql = "SELECT $$ hello world $$ FROM t";
        expect(sanitized(sql).length).toBe(sql.length);
    });
});

// ============================================================================
// Statement boundary tracking
// ============================================================================
describe("sanitizer — statement boundaries", () => {
    it("returns 0 for single statement", () => {
        expect(stmtStart("SELECT * FROM t")).toBe(0);
    });

    it("returns position after semicolon", () => {
        const sql = "SELECT 1; SELECT 2";
        const start = stmtStart(sql);
        expect(start).toBe(sql.indexOf(";") + 1);
    });

    it("returns position of last statement", () => {
        const sql = "SELECT 1; SELECT 2; SELECT 3";
        const start = stmtStart(sql);
        expect(sql.slice(start).trim()).toBe("SELECT 3");
    });

    it("ignores semicolons inside strings", () => {
        const sql = "SELECT 'a;b' FROM t";
        expect(stmtStart(sql)).toBe(0);
    });

    it("ignores semicolons inside comments", () => {
        const sql = "SELECT -- foo;\n* FROM t";
        expect(stmtStart(sql)).toBe(0);
    });

    it("ignores semicolons inside block comments", () => {
        const sql = "SELECT /* ; */ * FROM t";
        expect(stmtStart(sql)).toBe(0);
    });
});

// ============================================================================
// Mixed scenarios
// ============================================================================
describe("sanitizer — mixed scenarios", () => {
    it("handles string + comment + keyword", () => {
        const sql = "SELECT 'value' /* skip */ FROM t WHERE -- comment\nx = 1";
        expect(suppressed(sql)).toBe(false);
        const result = sanitized(sql);
        expect(result).toContain("FROM");
        expect(result).toContain("WHERE");
        expect(result.length).toBe(sql.length);
    });

    it("handles multiple strings", () => {
        const sql = "SELECT 'a', 'b', 'c' FROM t";
        expect(suppressed(sql)).toBe(false);
        const result = sanitized(sql);
        expect(result).toContain("FROM");
    });

    it("handles dollar-quote after string", () => {
        const sql = "SELECT 'x' || $$ body $$ FROM t";
        expect(suppressed(sql)).toBe(false);
    });

    it("handles comment after string before FROM", () => {
        const sql = "SELECT 'val' -- comment\nFROM t";
        expect(suppressed(sql)).toBe(false);
        expect(sanitized(sql)).toContain("FROM");
    });
});

// ============================================================================
// Backtick and bracket quoting
// ============================================================================
describe("sanitizer — backtick and bracket quoting", () => {
    it("strips backtick-quoted content", () => {
        const result = sanitized("SELECT `my col` FROM t");
        expect(result).not.toContain("my col");
        expect(result).toContain("FROM");
    });

    it("marks open backtick as suppressed", () => {
        expect(suppressed("SELECT `incomplete")).toBe(true);
    });

    it("strips bracket-quoted content", () => {
        const result = sanitized("SELECT [my col] FROM t");
        expect(result).not.toContain("my col");
        expect(result).toContain("FROM");
    });

    it("marks open bracket as suppressed", () => {
        expect(suppressed("SELECT [incomplete")).toBe(true);
    });
});

// ============================================================================
// Edge cases
// ============================================================================
describe("sanitizer — edge cases", () => {
    it("handles empty string", () => {
        const result = sanitizeSqlPrefix("");
        expect(result.sanitized).toBe("");
        expect(result.statementStart).toBe(0);
        expect(result.suppressed).toBe(false);
    });

    it("handles only whitespace", () => {
        const result = sanitizeSqlPrefix("   ");
        expect(result.sanitized).toBe("   ");
        expect(result.suppressed).toBe(false);
    });

    it("handles only a semicolon", () => {
        const result = sanitizeSqlPrefix(";");
        expect(result.statementStart).toBe(1);
    });

    it("handles multiple semicolons", () => {
        const result = sanitizeSqlPrefix(";;;");
        expect(result.statementStart).toBe(3);
    });

    it("handles newline-only input", () => {
        const result = sanitizeSqlPrefix("\n\n");
        expect(result.suppressed).toBe(false);
    });
});
