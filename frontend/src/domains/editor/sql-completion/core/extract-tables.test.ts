/**
 * Comprehensive extractTableRefs() and related utility tests.
 * Inspired by pgcli's test_parseutils.py.
 */

import { describe, expect, it } from "vitest";
import {
    tokenize,
    extractTableRefs,
    stripCtes,
    extractSelectColumns,
    isReserved,
    isTableKeyword,
    isJoinKeyword,
    isClauseTerminator,
} from "./extract-tables";
import { sanitizeSqlPrefix } from "./sanitizer";
import type { TableRef } from "./types";

/** Helper: extract refs from raw SQL, running sanitizer + tokenizer. */
function refs(sql: string): TableRef[] {
    const { sanitized } = sanitizeSqlPrefix(sql);
    return extractTableRefs(tokenize(sanitized));
}

/** Helper: extract refs + subquery columns from raw SQL. */
function refsWithSubquery(sql: string) {
    const { sanitized } = sanitizeSqlPrefix(sql);
    return extractTableRefs(tokenize(sanitized), { withSubqueryColumns: true });
}

/** Helper: get ref names (table names only). */
function refNames(sql: string): string[] {
    return refs(sql).map((r) => r.name);
}

// ============================================================================
// tokenize()
// ============================================================================
describe("tokenize", () => {
    it("tokenizes simple SELECT", () => {
        const tokens = tokenize("SELECT * FROM users");
        const values = tokens.map((t) => t.value);
        expect(values).toEqual(["SELECT", "*", "FROM", "users"]);
    });

    it("tokenizes schema-qualified table", () => {
        const tokens = tokenize("SELECT * FROM public.users");
        expect(tokens.map((t) => t.value)).toEqual(["SELECT", "*", "FROM", "public", ".", "users"]);
    });

    it("tokenizes quoted identifiers as single tokens", () => {
        const tokens = tokenize('SELECT * FROM "My Schema"."Orders"');
        expect(tokens.map((t) => t.value)).toEqual(["SELECT", "*", "FROM", '"My Schema"', ".", '"Orders"']);
        expect(tokens[3]?.isIdentifier).toBe(true);
        expect(tokens[5]?.isIdentifier).toBe(true);
    });

    it("tokenizes operators", () => {
        const tokens = tokenize("WHERE a = 1 AND b > 2");
        expect(tokens.map((t) => t.value)).toContain("=");
        expect(tokens.map((t) => t.value)).toContain(">");
    });

    it("tokenizes cast operator ::", () => {
        const tokens = tokenize("SELECT x::int");
        expect(tokens.map((t) => t.value)).toContain("::");
    });

    it("tokenizes parentheses", () => {
        const tokens = tokenize("SELECT COUNT(*)");
        expect(tokens.map((t) => t.value)).toContain("(");
        expect(tokens.map((t) => t.value)).toContain(")");
    });

    it("marks identifiers vs operators", () => {
        const tokens = tokenize("SELECT users FROM tbl");
        const selectToken = tokens.find((t) => t.value === "SELECT");
        expect(selectToken?.isIdentifier).toBe(true); // keyword-shaped but isIdentifier = true
        const fromToken = tokens.find((t) => t.value === "FROM");
        expect(fromToken?.isIdentifier).toBe(true);
    });

    it("handles empty string", () => {
        expect(tokenize("")).toEqual([]);
    });

    it("handles only whitespace", () => {
        expect(tokenize("   ")).toEqual([]);
    });

    it("uppercases token values", () => {
        const tokens = tokenize("select from");
        expect(tokens.map((t) => t.upper)).toEqual(["SELECT", "FROM"]);
    });

    it("preserves original case in value", () => {
        const tokens = tokenize("Select From Users");
        expect(tokens.map((t) => t.value)).toEqual(["Select", "From", "Users"]);
    });

    it("handles dollar sign in identifiers", () => {
        const tokens = tokenize("SELECT col$1 FROM t");
        expect(tokens.map((t) => t.value)).toContain("col$1");
    });

    it("handles underscored identifiers", () => {
        const tokens = tokenize("SELECT _my_col FROM my_table");
        expect(tokens.map((t) => t.value)).toContain("_my_col");
        expect(tokens.map((t) => t.value)).toContain("my_table");
    });
});

// ============================================================================
// isReserved / isTableKeyword / isJoinKeyword / isClauseTerminator
// ============================================================================
describe("reserved word helpers", () => {
    it.each(["SELECT", "FROM", "WHERE", "JOIN", "ON", "AND", "OR", "INSERT", "UPDATE", "DELETE"])(
        "isReserved('%s') = true",
        (word) => {
            expect(isReserved(word)).toBe(true);
        },
    );

    it.each(["users", "my_table", "abc123"])("isReserved('%s') = false", (word) => {
        expect(isReserved(word)).toBe(false);
    });

    it("isReserved is case-insensitive", () => {
        expect(isReserved("select")).toBe(true);
        expect(isReserved("Select")).toBe(true);
    });

    it.each(["FROM", "JOIN", "INTO", "UPDATE", "TABLE", "TRUNCATE"])(
        "isTableKeyword('%s') = true",
        (word) => {
            expect(isTableKeyword(word)).toBe(true);
        },
    );

    it.each(["JOIN", "INNER", "LEFT", "RIGHT", "FULL", "CROSS"])("isJoinKeyword('%s') = true", (word) => {
        expect(isJoinKeyword(word)).toBe(true);
    });

    it.each(["WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "ON", "USING"])(
        "isClauseTerminator('%s') = true",
        (word) => {
            expect(isClauseTerminator(word)).toBe(true);
        },
    );
});

// ============================================================================
// extractTableRefs — simple SELECT
// ============================================================================
describe("extractTableRefs — simple SELECT", () => {
    it("extracts single table", () => {
        const r = refs("SELECT * FROM abc");
        expect(r).toHaveLength(1);
        expect(r[0]).toEqual({ schema: null, name: "abc", alias: null });
    });

    it("extracts single table with partial select columns", () => {
        const r = refs("SELECT a,b FROM abc");
        expect(r).toHaveLength(1);
        expect(r[0]?.name).toBe("abc");
    });

    it("extracts multiple tables", () => {
        const names = refNames("SELECT * FROM abc, def");
        expect(names).toContain("abc");
        expect(names).toContain("def");
    });

    it("extracts schema-qualified table", () => {
        const r = refs("SELECT * FROM abc.def");
        expect(r).toHaveLength(1);
        expect(r[0]).toEqual({ schema: "abc", name: "def", alias: null });
    });

    it("extracts quoted table name", () => {
        const r = refs('SELECT * FROM "User Accounts"');
        expect(r).toHaveLength(1);
        expect(r[0]).toEqual({ schema: null, name: "User Accounts", alias: null });
    });

    it("extracts quoted schema-qualified table", () => {
        const r = refs('SELECT * FROM "My Schema"."Orders"');
        expect(r).toHaveLength(1);
        expect(r[0]).toEqual({ schema: "My Schema", name: "Orders", alias: null });
    });

    it("extracts multiple schema-qualified tables", () => {
        const r = refs("SELECT * FROM abc.def, ghi.jkl");
        expect(r).toHaveLength(2);
        expect(r[0]?.schema).toBe("abc");
        expect(r[0]?.name).toBe("def");
        expect(r[1]?.schema).toBe("ghi");
        expect(r[1]?.name).toBe("jkl");
    });

    it("handles hanging comma in SELECT columns", () => {
        const r = refs("SELECT a, FROM abc");
        expect(r).toHaveLength(1);
        expect(r[0]?.name).toBe("abc");
    });

    it("handles hanging comma with multiple tables", () => {
        const names = refNames("SELECT a, FROM abc, def");
        expect(names).toContain("abc");
        expect(names).toContain("def");
    });

    it("returns empty for empty string", () => {
        expect(refs("")).toEqual([]);
    });
});

// ============================================================================
// extractTableRefs — aliases
// ============================================================================
describe("extractTableRefs — aliases", () => {
    it("extracts implicit alias", () => {
        const r = refs("SELECT * FROM users u");
        expect(r[0]?.alias).toBe("u");
    });

    it("extracts explicit AS alias", () => {
        const r = refs("SELECT * FROM users AS u");
        expect(r[0]?.alias).toBe("u");
    });

    it("extracts aliases for multiple tables", () => {
        const r = refs("SELECT * FROM abc a, def d");
        expect(r[0]?.alias).toBe("a");
        expect(r[1]?.alias).toBe("d");
    });

    it("extracts mixed aliases", () => {
        const r = refs("SELECT * FROM users u, orders AS o");
        expect(r[0]?.alias).toBe("u");
        expect(r[1]?.alias).toBe("o");
    });

    it("handles AS keyword used as table context", () => {
        const r = refs("SELECT * FROM my_table AS m WHERE m.a > 5");
        expect(r).toHaveLength(1);
        expect(r[0]?.alias).toBe("m");
    });

    it("schema-qualified table with alias", () => {
        const r = refs("SELECT * FROM public.users u");
        expect(r[0]).toEqual({ schema: "public", name: "users", alias: "u" });
    });

    it("quoted table with alias", () => {
        const r = refs('SELECT * FROM "User Accounts" ua');
        expect(r[0]).toEqual({ schema: null, name: "User Accounts", alias: "ua" });
    });

    it("quoted alias with AS keyword", () => {
        const r = refs('SELECT * FROM "public"."vms_activitylog" AS "VA"');
        expect(r[0]).toEqual({ schema: "public", name: "vms_activitylog", alias: "VA" });
    });

    it("quoted alias without AS keyword", () => {
        const r = refs('SELECT * FROM "users" "U"');
        expect(r[0]).toEqual({ schema: null, name: "users", alias: "U" });
    });

    it("quoted schema.table with quoted alias in WHERE", () => {
        const r = refs('SELECT * FROM "public"."vms_activitylog" AS "VA" WHERE "VA".organization_id = 56');
        expect(r).toHaveLength(1);
        expect(r[0]).toEqual({ schema: "public", name: "vms_activitylog", alias: "VA" });
    });
});

// ============================================================================
// extractTableRefs — JOIN
// ============================================================================
describe("extractTableRefs — JOIN", () => {
    it.each(["", "INNER", "LEFT", "RIGHT"])(
        "extracts tables from %s JOIN",
        (joinType) => {
            const sql = `SELECT * FROM abc a ${joinType} JOIN def d ON a.id = d.num`;
            const names = refNames(sql);
            expect(names).toContain("abc");
            expect(names).toContain("def");
        },
    );

    it("extracts schema-qualified join", () => {
        const r = refs("SELECT * FROM abc.def x JOIN ghi.jkl y ON x.id = y.num");
        expect(r).toHaveLength(2);
        expect(r[0]).toEqual({ schema: "abc", name: "def", alias: "x" });
        expect(r[1]).toEqual({ schema: "ghi", name: "jkl", alias: "y" });
    });

    it("handles incomplete join clause", () => {
        const sql = "SELECT a.x, b.y FROM abc a JOIN bcd b ON a.id =";
        const r = refs(sql);
        expect(r).toHaveLength(2);
        expect(r[0]?.name).toBe("abc");
        expect(r[1]?.name).toBe("bcd");
    });

    it("extracts multiple joins", () => {
        const sql = `SELECT * FROM t1
            INNER JOIN t2 ON t1.id = t2.t1_id
            INNER JOIN t3 ON t2.id = t3.t2_id`;
        const names = refNames(sql);
        expect(names).toContain("t1");
        expect(names).toContain("t2");
        expect(names).toContain("t3");
    });

    it("handles cross join", () => {
        const names = refNames("SELECT * FROM foo CROSS JOIN bar");
        expect(names).toContain("foo");
        expect(names).toContain("bar");
    });
});

// ============================================================================
// extractTableRefs — INSERT / UPDATE
// ============================================================================
describe("extractTableRefs — INSERT / UPDATE", () => {
    it("extracts table from simple INSERT", () => {
        const r = refs("INSERT INTO abc (id, name) VALUES (1, 'def')");
        expect(r.some((ref) => ref.name === "abc")).toBe(true);
    });

    it("extracts table from UPDATE", () => {
        const r = refs("UPDATE abc SET id = 1");
        expect(r).toHaveLength(1);
        expect(r[0]?.name).toBe("abc");
    });

    it("extracts schema-qualified UPDATE", () => {
        const r = refs("UPDATE abc.def SET id = 1");
        expect(r).toHaveLength(1);
        expect(r[0]).toEqual({ schema: "abc", name: "def", alias: null });
    });
});

// ============================================================================
// extractTableRefs — edge cases
// ============================================================================
// ============================================================================
// extractTableRefs — function-in-FROM
// ============================================================================
describe("extractTableRefs — function-in-FROM", () => {
    it("extracts function call as table ref", () => {
        const r = refs("SELECT * FROM generate_series(1, 10)");
        expect(r).toHaveLength(1);
        expect(r[0]?.name).toBe("generate_series");
    });

    it("extracts function call with alias", () => {
        const r = refs("SELECT * FROM generate_series(1, 10) AS gs");
        expect(r).toHaveLength(1);
        expect(r[0]?.name).toBe("generate_series");
        expect(r[0]?.alias).toBe("gs");
    });

    it("extracts function call with implicit alias", () => {
        const r = refs("SELECT * FROM generate_series(1, 10) gs");
        expect(r).toHaveLength(1);
        expect(r[0]?.alias).toBe("gs");
    });

    it("extracts schema-qualified function call", () => {
        const r = refs("SELECT * FROM pg_catalog.generate_series(1, 10)");
        expect(r).toHaveLength(1);
        expect(r[0]?.schema).toBe("pg_catalog");
        expect(r[0]?.name).toBe("generate_series");
    });

    it("extracts function alongside regular table", () => {
        const r = refs("SELECT * FROM users, generate_series(1, 10) gs");
        expect(r).toHaveLength(2);
        expect(r[0]?.name).toBe("users");
        expect(r[1]?.name).toBe("generate_series");
        expect(r[1]?.alias).toBe("gs");
    });

    it("extracts function with nested parens", () => {
        const r = refs("SELECT * FROM unnest(ARRAY[1,2,3]) AS vals");
        expect(r).toHaveLength(1);
        expect(r[0]?.name).toBe("unnest");
        expect(r[0]?.alias).toBe("vals");
    });

    it("handles function in JOIN", () => {
        const r = refs("SELECT * FROM users JOIN generate_series(1, 5) gs ON gs.value = users.id");
        expect(r).toHaveLength(2);
        expect(r[0]?.name).toBe("users");
        expect(r[1]?.name).toBe("generate_series");
        expect(r[1]?.alias).toBe("gs");
    });

    it("handles incomplete function call (no closing paren)", () => {
        const r = refs("SELECT * FROM generate_series(1, 10");
        // Should not crash; function ref may or may not be extracted
        expect(r).toBeDefined();
    });
});

// ============================================================================
// extractTableRefs — edge cases
// ============================================================================
describe("extractTableRefs — edge cases", () => {
    it("does not extract function alias as table", () => {
        const r = refs("SELECT 123 AS foo");
        expect(r).toEqual([]);
    });

    it("does not extract table from SELECT t1. (period at end)", () => {
        const sql = "SELECT t1. FROM tabl1 t1, tabl2 t2";
        const r = refs(sql);
        const names = r.map((ref) => ref.name);
        expect(names).toContain("tabl1");
        expect(names).toContain("tabl2");
    });

    it("handles subselect tables", () => {
        const r = refs("SELECT * FROM (SELECT * FROM abc");
        // Should still find abc since we tokenize the inner query
        expect(r.some((ref) => ref.name === "abc")).toBe(true);
    });

    it("handles TRUNCATE", () => {
        const r = refs("TRUNCATE my_table");
        expect(r).toHaveLength(1);
        expect(r[0]?.name).toBe("my_table");
    });

    it("handles DELETE FROM", () => {
        const r = refs("DELETE FROM users WHERE id = 1");
        // DELETE is not in TABLE_CONTEXT_KEYWORDS but FROM is
        expect(r.some((ref) => ref.name === "users")).toBe(true);
    });
});

// ============================================================================
// stripCtes
// ============================================================================
describe("stripCtes", () => {
    it("returns unchanged for non-CTE query", () => {
        const sql = "SELECT * FROM foo";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.localTableNames).toEqual([]);
        expect(result.sanitized).toBe(san);
    });

    it("extracts single CTE name", () => {
        const sql = "WITH cte AS (SELECT 1) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.localTableNames).toContain("cte");
    });

    it("extracts multiple CTE names", () => {
        const sql = "WITH c1 AS (SELECT 1), c2 AS (SELECT 2) SELECT * FROM c1, c2";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.localTableNames).toContain("c1");
        expect(result.localTableNames).toContain("c2");
    });

    it("handles RECURSIVE keyword", () => {
        const sql = "WITH RECURSIVE tree AS (SELECT 1) SELECT * FROM tree";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.localTableNames).toContain("tree");
    });

    it("handles CTE with column list", () => {
        const sql = "WITH cte(a, b) AS (SELECT 1, 2) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.localTableNames).toContain("cte");
    });

    it("strips CTE body from remaining SQL", () => {
        const sql = "WITH cte AS (SELECT 1) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        // Remaining should contain SELECT * FROM cte (stripped of CTE definition)
        expect(result.sanitized.trim()).toMatch(/^SELECT/i);
    });

    it("handles incomplete CTE gracefully", () => {
        const sql = "WITH cte AS (SELECT 1";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        // Unmatched paren — should return empty localTableNames
        expect(result.localTableNames).toEqual([]);
    });
});

// ============================================================================
// extractSelectColumns
// ============================================================================
describe("extractSelectColumns", () => {
    it("extracts bare column names", () => {
        expect(extractSelectColumns("SELECT id, name, email FROM users")).toEqual([
            "id",
            "name",
            "email",
        ]);
    });

    it("extracts aliased columns (AS keyword)", () => {
        expect(extractSelectColumns("SELECT id AS user_id, name AS full_name FROM users")).toEqual([
            "user_id",
            "full_name",
        ]);
    });

    it("extracts dot-qualified columns (table.column)", () => {
        expect(extractSelectColumns("SELECT u.id, u.email FROM users u")).toEqual(["id", "email"]);
    });

    it("handles function calls (skips paren internals)", () => {
        expect(extractSelectColumns("SELECT count(*), max(price) AS max_price FROM orders")).toEqual([
            "count",
            "max_price",
        ]);
    });

    it("handles SELECT * (returns empty for star)", () => {
        expect(extractSelectColumns("SELECT * FROM orders")).toEqual([]);
    });

    it("skips DISTINCT keyword", () => {
        expect(extractSelectColumns("SELECT DISTINCT id, name FROM users")).toEqual(["id", "name"]);
    });

    it("handles no FROM (SELECT-only)", () => {
        expect(extractSelectColumns("SELECT 1 AS one, 2 AS two")).toEqual(["one", "two"]);
    });

    it("handles mixed expressions and aliases", () => {
        expect(
            extractSelectColumns("SELECT a.id, count(*) AS cnt, b.name FROM a JOIN b"),
        ).toEqual(["id", "cnt", "name"]);
    });

    it("returns empty for empty input", () => {
        expect(extractSelectColumns("")).toEqual([]);
    });

    it("returns empty for non-SELECT", () => {
        expect(extractSelectColumns("INSERT INTO foo VALUES (1)")).toEqual([]);
    });
});

// ============================================================================
// stripCtes — cteColumns extraction
// ============================================================================
describe("stripCtes — cteColumns", () => {
    it("extracts columns from CTE SELECT list", () => {
        const sql = "WITH cte AS (SELECT id, name FROM users) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.get("cte")).toEqual(["id", "name"]);
    });

    it("extracts columns from CTE with explicit column list", () => {
        const sql = "WITH cte(user_id, user_name) AS (SELECT id, name FROM users) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.get("cte")).toEqual(["user_id", "user_name"]);
    });

    it("extracts columns from multiple CTEs", () => {
        const sql =
            "WITH a AS (SELECT id, email FROM users), b AS (SELECT order_id, total FROM orders) SELECT * FROM a JOIN b";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.get("a")).toEqual(["id", "email"]);
        expect(result.cteColumns.get("b")).toEqual(["order_id", "total"]);
    });

    it("extracts aliased columns from CTE body", () => {
        const sql = "WITH cte AS (SELECT id AS uid, count(*) AS cnt FROM users) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.get("cte")).toEqual(["uid", "cnt"]);
    });

    it("explicit column list takes priority over SELECT list", () => {
        const sql = "WITH cte(a, b) AS (SELECT id, name FROM users) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.get("cte")).toEqual(["a", "b"]);
    });

    it("case-insensitive CTE name lookup", () => {
        const sql = "WITH MyCte AS (SELECT id FROM users) SELECT * FROM MyCte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.get("mycte")).toEqual(["id"]);
    });

    it("returns empty map for incomplete CTE", () => {
        const sql = "WITH cte AS (SELECT id";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.size).toBe(0);
    });

    it("handles dot-qualified columns in CTE body", () => {
        const sql = "WITH cte AS (SELECT u.id, u.email FROM users u) SELECT * FROM cte";
        const { sanitized: san } = sanitizeSqlPrefix(sql);
        const result = stripCtes(sql, san);
        expect(result.cteColumns.get("cte")).toEqual(["id", "email"]);
    });
});

describe("Subquery alias extraction", () => {
    it("extracts subquery alias as table ref", () => {
        const result = refs("SELECT * FROM (SELECT id FROM users) sub WHERE ");
        expect(result).toContainEqual({ schema: null, name: "sub", alias: null });
    });

    it("extracts subquery alias with AS keyword", () => {
        const result = refs("SELECT * FROM (SELECT id FROM users) AS sub WHERE ");
        expect(result).toContainEqual({ schema: null, name: "sub", alias: null });
    });

    it("extracts subquery columns", () => {
        const result = refsWithSubquery("SELECT sub. FROM (SELECT id, name FROM users) sub WHERE ");
        expect(result.subqueryColumns.get("sub")).toEqual(["id", "name"]);
    });

    it("extracts aliased subquery columns", () => {
        const result = refsWithSubquery("SELECT s. FROM (SELECT id, email AS e FROM users) AS s WHERE ");
        expect(result.subqueryColumns.get("s")).toEqual(["id", "e"]);
    });

    it("handles subquery in JOIN", () => {
        const result = refsWithSubquery("SELECT * FROM orders o JOIN (SELECT id, name FROM users) u ON o.user_id = u.id WHERE ");
        expect(result.refs).toContainEqual({ schema: null, name: "orders", alias: "o" });
        expect(result.refs).toContainEqual({ schema: null, name: "u", alias: null });
        expect(result.subqueryColumns.get("u")).toEqual(["id", "name"]);
    });

    it("does not extract columns when no alias", () => {
        const result = refsWithSubquery("SELECT * FROM (SELECT id FROM users) WHERE ");
        expect(result.subqueryColumns.size).toBe(0);
    });

    it("handles nested subquery", () => {
        const result = refsWithSubquery("SELECT * FROM (SELECT x FROM (SELECT 1 AS x) inner_q) outer_q WHERE ");
        expect(result.refs).toContainEqual({ schema: null, name: "outer_q", alias: null });
        expect(result.subqueryColumns.get("outer_q")).toEqual(["x"]);
    });
});
