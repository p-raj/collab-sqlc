/**
 * Comprehensive suggestType() tests — inspired by pgcli's test_sqlcompletion.py.
 *
 * Tests are organized by SQL context to match pgcli's structure:
 *   - SELECT expression context
 *   - FROM / table context
 *   - WHERE / filter context
 *   - JOIN / ON / USING context
 *   - INSERT / UPDATE context
 *   - DDL (CREATE/ALTER/DROP) context
 *   - Qualified access (alias.col, schema.table)
 *   - Continuation tokens (, AND OR =)
 *   - Multi-statement / CTE
 *   - Suppression (strings, comments)
 *   - Edge cases
 */

import { describe, expect, it } from "vitest";
import { suggestType } from "../core/suggest";
import type { SuggestionHint } from "../core/types";

function hintKinds(sql: string, cursor?: number): string[] {
    return suggestType(sql, cursor ?? sql.length).map((h) => h.kind);
}

function hints(sql: string, cursor?: number): SuggestionHint[] {
    return suggestType(sql, cursor ?? sql.length);
}

function hasHint(sql: string, kind: string, cursor?: number): boolean {
    return hintKinds(sql, cursor).includes(kind);
}

function colHint(sql: string, cursor?: number) {
    return hints(sql, cursor).find((h) => h.kind === "column");
}

function tableHint(sql: string, cursor?: number) {
    return hints(sql, cursor).find((h) => h.kind === "table");
}

function kwHint(sql: string, cursor?: number) {
    return hints(sql, cursor).find((h) => h.kind === "keyword");
}

function qualHint(sql: string, cursor?: number) {
    return hints(sql, cursor).find((h) => h.kind === "qualified");
}

// ============================================================================
// Empty / initial context
// ============================================================================
describe("suggestType — empty / initial context", () => {
    it("suggests keywords for empty string", () => {
        expect(hintKinds("")).toEqual(["keyword"]);
    });

    it.each(["S", "SE", "SEL", "SELE", "SELEC"])("suggests keywords for partial keyword: %s", (sql) => {
        expect(hintKinds(sql)).toEqual(["keyword"]);
    });

    it("suggests keywords for whitespace-only input", () => {
        expect(hintKinds("   ")).toEqual(["keyword"]);
    });

    it("suggests keywords for newline-only input", () => {
        expect(hintKinds("\n")).toEqual(["keyword"]);
    });

    it("handles invalid SQL gracefully", () => {
        const result = hints("selt *");
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// SELECT expression context
// ============================================================================
describe("suggestType — SELECT expression context", () => {
    it("suggests columns, functions, keywords after SELECT", () => {
        const kinds = hintKinds("SELECT ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
        expect(kinds).toContain("keyword");
    });

    it("suggests expression context with visible table scope", () => {
        const sql = "SELECT  FROM tabl";
        const cursor = "SELECT ".length;
        const kinds = hintKinds(sql, cursor);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
        expect(kinds).toContain("keyword");
    });

    it("suggests columns + functions for partial word after SELECT", () => {
        expect(hasHint("SELECT na", "column")).toBe(true);
        expect(hasHint("SELECT na", "function")).toBe(true);
    });

    it("suggests expression after DISTINCT", () => {
        const kinds = hintKinds("SELECT DISTINCT ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
        expect(kinds).toContain("keyword");
    });

    it("suggests expression after INSERT INTO ... SELECT DISTINCT", () => {
        const kinds = hintKinds("INSERT INTO foo SELECT DISTINCT ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("tracks table references for column hints (single table in FROM)", () => {
        const sql = "SELECT  FROM tabl";
        const cursor = "SELECT ".length;
        const col = colHint(sql, cursor);
        expect(col).toBeDefined();
        if (col?.kind === "column") {
            // Table appears after cursor, so no refs parsed from before-cursor text
            expect(col.tableRefs).toHaveLength(0);
        }
    });

    it("suggests columns after MAX( with table context", () => {
        const sql = "SELECT MAX( FROM tbl";
        const cursor = "SELECT MAX(".length;
        const kinds = hintKinds(sql, cursor);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests expression after HAVING", () => {
        const kinds = hintKinds("SELECT * FROM users GROUP BY id HAVING ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests expression after operator in SELECT clause", () => {
        const kinds = hintKinds("SELECT a + ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });
});

// ============================================================================
// FROM / table context
// ============================================================================
describe("suggestType — FROM / table context", () => {
    it("suggests tables and schemas after FROM", () => {
        const kinds = hintKinds("SELECT * FROM ");
        expect(kinds).toContain("table");
        expect(kinds).toContain("schema");
    });

    it("suggests tables with partial prefix", () => {
        expect(hasHint("SELECT * FROM us", "table")).toBe(true);
    });

    it.each(["INSERT INTO ", "UPDATE "])("suggests tables after %s", (prefix) => {
        const kinds = hintKinds(prefix);
        expect(kinds).toContain("table");
    });

    it("suggests tables and schemas after TRUNCATE", () => {
        const kinds = hintKinds("TRUNCATE ");
        expect(kinds).toContain("table");
        expect(kinds).toContain("schema");
    });

    it("suggests tables after CROSS JOIN", () => {
        const kinds = hintKinds("SELECT * FROM users CROSS JOIN ");
        expect(kinds).toContain("table");
    });

    it("suggests tables after NATURAL JOIN", () => {
        const kinds = hintKinds("SELECT * FROM users NATURAL JOIN ");
        expect(kinds).toContain("table");
    });

    it("does not suggest smart join after CROSS JOIN", () => {
        const kinds = hintKinds("SELECT * FROM users CROSS JOIN ");
        expect(kinds).not.toContain("join");
    });

    it("does not suggest smart join after NATURAL JOIN", () => {
        const kinds = hintKinds("SELECT * FROM users NATURAL JOIN ");
        expect(kinds).not.toContain("join");
    });

    it("suggests tables after comma in FROM clause", () => {
        const kinds = hintKinds("SELECT a, b FROM tbl1, ");
        expect(kinds).toContain("table");
        expect(kinds).toContain("schema");
    });

    it("does NOT suggest tables after comma in SELECT clause", () => {
        const kinds = hintKinds("SELECT a, ");
        expect(kinds).not.toContain("table");
        expect(kinds).toContain("column");
    });
});

// ============================================================================
// WHERE / filter context
// ============================================================================
describe("suggestType — WHERE / filter context", () => {
    it.each([
        "SELECT * FROM tabl WHERE ",
        "SELECT * FROM tabl WHERE (",
        "SELECT * FROM tabl WHERE foo = ",
        "SELECT * FROM tabl WHERE bar OR ",
        "SELECT * FROM tabl WHERE foo = 1 AND ",
        "SELECT * FROM tabl WHERE (bar > 10 AND ",
        "SELECT * FROM tabl WHERE foo BETWEEN ",
    ])("suggests columns + functions in WHERE: %s", (sql) => {
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("extracts table refs for column hints in WHERE", () => {
        const col = colHint("SELECT * FROM users u WHERE ");
        expect(col).toBeDefined();
        if (col?.kind === "column") {
            expect(col.tableRefs).toHaveLength(1);
            expect(col.tableRefs[0]?.name).toBe("users");
            expect(col.tableRefs[0]?.alias).toBe("u");
        }
    });

    it("suggests columns for partially typed column name", () => {
        expect(hasHint("SELECT * FROM tabl WHERE col_n", "column")).toBe(true);
    });

    it.each([
        "SELECT * FROM tabl WHERE foo IN (",
        "SELECT * FROM tabl WHERE foo IN (bar, ",
    ])("suggests columns in WHERE IN clause: %s", (sql) => {
        expect(hasHint(sql, "column")).toBe(true);
    });

    it("suggests columns after WHERE = ANY(", () => {
        expect(hasHint("SELECT * FROM tabl WHERE foo = ANY(", "column")).toBe(true);
    });

    it.each([
        "SELECT * FROM tabl WHERE 10 < ",
        "SELECT * FROM tabl WHERE age > ",
        "SELECT * FROM tabl WHERE x + ",
        "SELECT * FROM tabl WHERE x - ",
        "SELECT * FROM tabl WHERE x * ",
        "SELECT * FROM tabl WHERE x / ",
    ])("suggests columns + functions after operator in WHERE: %s", (sql) => {
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests columns after closing paren followed by operator", () => {
        const sql = "SELECT * FROM foo WHERE created > now() - ";
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests columns after closing paren in WHERE expression", () => {
        const sql = "SELECT * FROM foo WHERE (bar > 10) AND ";
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it.each([
        "SELECT * FROM tabl WHERE (bar AND (baz OR (qux AND (",
        "SELECT * FROM tabl WHERE (bar > 10 AND (",
    ])("suggests expression in deeply nested parens: %s", (sql) => {
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests expression after BETWEEN ... AND", () => {
        const sql = "SELECT * FROM tabl WHERE foo BETWEEN 1 AND ";
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });
});

// ============================================================================
// JOIN context
// ============================================================================
describe("suggestType — JOIN context", () => {
    it.each(["", "INNER", "LEFT", "RIGHT OUTER", "LEFT OUTER", "FULL", "FULL OUTER"])(
        "suggests tables after %s JOIN",
        (joinType) => {
            const sql = `SELECT * FROM abc ${joinType} JOIN `;
            expect(hasHint(sql, "table")).toBe(true);
            expect(hasHint(sql, "schema")).toBe(true);
        },
    );

    it("includes table refs from existing tables when suggesting JOIN", () => {
        const sql = "SELECT * FROM foo JOIN bar ON bar.id = foo.id JOIN ";
        const tblHint = tableHint(sql);
        expect(tblHint).toBeDefined();
    });

    it("suggests join hints for potential smart join", () => {
        const sql = "SELECT * FROM users JOIN ";
        expect(hasHint(sql, "join")).toBe(true);
    });

    it("suggests tables after JOIN with two existing tables", () => {
        const sql = "SELECT * FROM foo JOIN bar USING (id) JOIN ";
        expect(hasHint(sql, "table")).toBe(true);
    });
});

// ============================================================================
// ON context — join conditions and aliases
// ============================================================================
describe("suggestType — ON context", () => {
    it.each([
        "SELECT a.x, b.y FROM abc a JOIN bcd b ON ",
        "SELECT a.x, b.y\nFROM abc a\nJOIN bcd b ON\n",
        "SELECT a.x, b.y FROM abc a JOIN bcd b ON a.id = b.id OR ",
    ])("suggests aliases and join conditions after ON: %s", (sql) => {
        expect(hasHint(sql, "join-condition")).toBe(true);
        expect(hasHint(sql, "alias")).toBe(true);
    });

    it("includes all table refs in join-condition hint", () => {
        const result = hints("SELECT * FROM users u JOIN orders o ON ");
        const jcHint = result.find((h) => h.kind === "join-condition");
        expect(jcHint).toBeDefined();
        if (jcHint?.kind === "join-condition") {
            expect(jcHint.tableRefs).toHaveLength(2);
            expect(jcHint.tableRefs.map((t) => t.alias)).toEqual(["u", "o"]);
        }
    });

    it("includes parent in join-condition hint", () => {
        const result = hints("SELECT * FROM users u JOIN orders o ON ");
        const jcHint = result.find((h) => h.kind === "join-condition");
        if (jcHint?.kind === "join-condition") {
            expect(jcHint.parent).toBeDefined();
        }
    });

    it("suggests aliases without table aliases (use table names)", () => {
        const sql = "SELECT abc.x, bcd.y FROM abc JOIN bcd ON ";
        const aliasHint = hints(sql).find((h) => h.kind === "alias");
        if (aliasHint?.kind === "alias") {
            expect(aliasHint.aliases).toContain("abc");
            expect(aliasHint.aliases).toContain("bcd");
        }
    });

    it("suggests aliases on right side of ON expression", () => {
        const sql = "SELECT a.x, b.y FROM abc a JOIN bcd b ON a.id = ";
        const kinds = hintKinds(sql);
        // After = we should get continuation that leads back to an alias-friendly context
        expect(kinds.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// USING context
// ============================================================================
describe("suggestType — USING context", () => {
    it.each([
        "SELECT * FROM abc INNER JOIN def USING (",
    ])("suggests columns in USING clause: %s", (sql) => {
        const col = colHint(sql);
        expect(col).toBeDefined();
    });

    it("suggests continuation in USING clause with comma (walks to join context)", () => {
        // After comma in USING(), continuation walks past '(' to JOIN context
        const kinds = hintKinds("SELECT * FROM abc INNER JOIN def USING (col1, ");
        expect(kinds.length).toBeGreaterThan(0);
    });

    it("tracks table refs for USING clause", () => {
        const col = colHint("SELECT * FROM users JOIN orders USING (");
        if (col?.kind === "column") {
            expect(col.tableRefs.length).toBeGreaterThan(0);
        }
    });
});

// ============================================================================
// Qualified access (alias.col, schema.table)
// ============================================================================
describe("suggestType — qualified access", () => {
    it.each([
        { sql: "SELECT t1. FROM tabl1 t1", cursor: "SELECT t1.".length },
        { sql: "SELECT t1. FROM tabl1 t1, tabl2 t2", cursor: "SELECT t1.".length },
    ])("returns qualified hint for alias dot: $sql", ({ sql, cursor }) => {
        const result = hints(sql, cursor);
        expect(result).toHaveLength(1);
        expect(result[0]?.kind).toBe("qualified");
        if (result[0]?.kind === "qualified") {
            expect(result[0].qualifier).toBe("t1");
        }
    });

    it.each([
        "SELECT * FROM tabl1 t1 WHERE t1.",
        "SELECT * FROM tabl1 t1, tabl2 t2 WHERE t1.",
    ])("returns qualified hint in WHERE with alias: %s", (sql) => {
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("t1");
        }
    });

    it("returns qualified hint for schema.table access", () => {
        const q = qualHint("SELECT * FROM public.");
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("public");
        }
    });

    it("returns qualified hint for quoted schema access", () => {
        const q = qualHint('SELECT * FROM "My Schema".');
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("My Schema");
        }
    });

    it("returns qualified hint for comma-separated qualified select", () => {
        const sql = "SELECT t1.a, t2. FROM tabl1 t1, tabl2 t2";
        const cursor = "SELECT t1.a, t2.".length;
        const q = qualHint(sql, cursor);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("t2");
        }
    });

    it("returns qualified hint in JOIN ON alias.", () => {
        const sql = "SELECT * FROM abc a JOIN def d ON a.";
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("a");
            expect(q.tableRefs.length).toBeGreaterThanOrEqual(2);
        }
    });

    it("returns qualified hint for JOIN ON right-side alias.", () => {
        const sql = "SELECT * FROM abc a JOIN def d ON a.id = d.";
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("d");
        }
    });

    it("returns qualified hint with AND in JOIN ON clause", () => {
        const sql = "SELECT * FROM abc a JOIN def d ON a.id = d.id AND a.";
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("a");
        }
    });

    it("handles schema-qualified in INSERT INTO", () => {
        const q = qualHint("INSERT INTO sch.");
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("sch");
        }
    });

    it("handles schema-qualified in UPDATE", () => {
        const q = qualHint("UPDATE sch.");
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("sch");
        }
    });

    it("handles schema-qualified in TRUNCATE", () => {
        const q = qualHint("TRUNCATE sch.");
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("sch");
        }
    });

    it("handles function argument with alias", () => {
        const sql = "SELECT avg(x. FROM tbl x, tbl2 y";
        const cursor = "SELECT avg(x.".length;
        const q = qualHint(sql, cursor);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("x");
        }
    });

    it("resolves quoted alias via AS keyword", () => {
        const sql = 'SELECT * FROM "public"."vms_activitylog" AS "VA" WHERE "VA".';
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("VA");
            expect(q.tableRefs[0]?.alias).toBe("VA");
            expect(q.tableRefs[0]?.name).toBe("vms_activitylog");
            expect(q.tableRefs[0]?.schema).toBe("public");
        }
    });

    it("resolves quoted alias without AS keyword", () => {
        const sql = 'SELECT * FROM "users" "U" WHERE "U".';
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("U");
            expect(q.tableRefs[0]?.alias).toBe("U");
        }
    });

    it("resolves quoted schema.table without alias", () => {
        const sql = 'SELECT * FROM "public"."vms_activitylog" WHERE "vms_activitylog".';
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("vms_activitylog");
        }
    });
});

// ============================================================================
// INSERT context
// ============================================================================
describe("suggestType — INSERT context", () => {
    it.each([
        "INSERT INTO abc (",
        "INSERT INTO abc () SELECT * FROM hij;",
    ])("suggests columns for INSERT INTO table (: %s", (sql) => {
        const cursor = sql.indexOf("(") + 1;
        const col = colHint(sql, cursor);
        expect(col).toBeDefined();
        if (col?.kind === "column") {
            expect(col.context).toBe("insert");
        }
    });

    it("suggests columns for partial text in INSERT column list", () => {
        const col = colHint("INSERT INTO abc (i");
        expect(col).toBeDefined();
        if (col?.kind === "column") {
            expect(col.context).toBe("insert");
        }
    });

    it("suggests columns after comma in INSERT column list", () => {
        const col = colHint("INSERT INTO abc (id,");
        expect(col).toBeDefined();
        if (col?.kind === "column") {
            expect(col.context).toBe("insert");
        }
    });

    it("suggests columns after multiple commas in INSERT column list", () => {
        const col = colHint("INSERT INTO abc (id, name, ");
        expect(col).toBeDefined();
        if (col?.kind === "column") {
            expect(col.context).toBe("insert");
        }
    });

    it("suggests tables and schemas after INSERT INTO", () => {
        const kinds = hintKinds("INSERT INTO ");
        expect(kinds).toContain("table");
    });

    it("does not suggest insert columns after VALUES (", () => {
        const sql = "INSERT INTO abc (id) VALUES (";
        // After VALUES (, we're in subquery/expression, not insert column context
        const col = colHint(sql);
        if (col?.kind === "column") {
            expect(col.context).not.toBe("insert");
        }
    });

    it("suggests WHERE columns in INSERT ... SELECT ... WHERE", () => {
        const sql = "INSERT INTO OtherTabl(ID, Name) SELECT * FROM tabl WHERE ";
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests WHERE columns in INSERT ... SELECT (no column list) ... WHERE", () => {
        const sql = "INSERT INTO OtherTabl SELECT * FROM tabl WHERE ";
        const kinds = hintKinds(sql);
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });
});

// ============================================================================
// UPDATE SET context
// ============================================================================
describe("suggestType — UPDATE SET context", () => {
    it("suggests columns after UPDATE table SET", () => {
        const col = colHint("UPDATE users SET ");
        expect(col).toBeDefined();
    });

    it("tracks table reference in UPDATE", () => {
        const col = colHint("UPDATE users SET ");
        if (col?.kind === "column") {
            expect(col.tableRefs.some((r) => r.name === "users")).toBe(true);
        }
    });
});

// ============================================================================
// CAST / datatype context
// ============================================================================
describe("suggestType — cast / datatype context", () => {
    it.each([
        "SELECT x::",
        "SELECT x::y",
        "SELECT (x + y)::",
    ])("suggests datatypes after cast operator: %s", (sql) => {
        expect(hasHint(sql, "datatype")).toBe(true);
        expect(hasHint(sql, "table")).toBe(true); // tables are composite types in PG
    });

    it("suggests datatypes with schema after schema-qualified cast", () => {
        const q = qualHint("SELECT foo::bar.");
        expect(q).toBeDefined();
    });

    it("suggests datatypes after ALTER COLUMN TYPE", () => {
        expect(hasHint("ALTER TABLE foo ALTER COLUMN bar TYPE ", "datatype")).toBe(true);
    });

    it.each([
        "CREATE TABLE foo (bar ",
        "CREATE TABLE foo (bar DOU",
        "CREATE TABLE foo (bar INT, baz ",
        "CREATE FUNCTION foo (bar ",
        "CREATE FUNCTION foo (bar INT, baz ",
    ])("suggests datatypes in CREATE definition: %s", (sql) => {
        const kinds = hintKinds(sql);
        expect(kinds.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// DDL context (CREATE / ALTER / DROP)
// ============================================================================
describe("suggestType — DDL context", () => {
    it("suggests keywords after CREATE", () => {
        const kw = kwHint("CREATE ");
        expect(kw).toBeDefined();
        if (kw?.kind === "keyword") {
            expect(kw.lastToken).toBe("CREATE");
        }
    });

    it("suggests keywords after ALTER", () => {
        const kw = kwHint("ALTER ");
        expect(kw).toBeDefined();
        if (kw?.kind === "keyword") {
            expect(kw.lastToken).toBe("ALTER");
        }
    });

    it("suggests keywords after DROP", () => {
        const kw = kwHint("DROP ");
        expect(kw).toBeDefined();
        if (kw?.kind === "keyword") {
            expect(kw.lastToken).toBe("DROP");
        }
    });

    it("suggests tables after DROP TABLE", () => {
        const kinds = hintKinds("DROP TABLE ");
        expect(kinds).toContain("table");
        expect(kinds).toContain("schema");
    });

    it("suggests schema-qualified table after DROP TABLE schema.", () => {
        const q = qualHint("DROP TABLE schema_name.");
        expect(q).toBeDefined();
    });

    it("suggests schemas after DROP SCHEMA", () => {
        expect(hasHint("DROP SCHEMA ", "schema")).toBe(true);
    });

    it("suggests table/view after TABLE keyword", () => {
        const kinds = hintKinds("ALTER TABLE ");
        expect(kinds).toContain("table");
    });

    it("suggests function after FUNCTION keyword in CREATE context", () => {
        const kinds = hintKinds("DROP FUNCTION ");
        expect(kinds.length).toBeGreaterThan(0);
    });

    it("suggests columns after ALTER TABLE foo ALTER COLUMN", () => {
        const col = colHint("ALTER TABLE foo ALTER COLUMN ");
        expect(col).toBeDefined();
    });

    it("suggests columns after ALTER TABLE foo DROP COLUMN", () => {
        const col = colHint("ALTER TABLE foo DROP COLUMN ");
        expect(col).toBeDefined();
    });

    it("suggests keywords after ALTER TABLE foo ALTER", () => {
        const kw = kwHint("ALTER TABLE foo ALTER ");
        expect(kw).toBeDefined();
    });
});

// ============================================================================
// SCHEMA context
// ============================================================================
describe("suggestType — SCHEMA context", () => {
    it("suggests schemas after DROP SCHEMA", () => {
        expect(hasHint("DROP SCHEMA ", "schema")).toBe(true);
    });

    it("suggests schemas after SET search_path TO", () => {
        const kinds = hintKinds("SET search_path TO ");
        expect(kinds.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// AS context — alias being typed
// ============================================================================
describe("suggestType — AS context", () => {
    it.each([
        "SELECT 1 AS ",
        "SELECT 1 FROM tabl AS ",
    ])("returns empty after AS (alias being typed): %s", (sql) => {
        expect(hints(sql)).toEqual([]);
    });
});

// ============================================================================
// ORDER BY / GROUP BY
// ============================================================================
describe("suggestType — ORDER BY / GROUP BY", () => {
    it("suggests expression after ORDER BY", () => {
        const kinds = hintKinds("SELECT * FROM users ORDER BY ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests expression after GROUP BY", () => {
        const kinds = hintKinds("SELECT * FROM users GROUP BY ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("suggests keywords after ORDER (waiting for BY)", () => {
        const kw = kwHint("SELECT * FROM users ORDER ");
        expect(kw).toBeDefined();
    });

    it("tracks table refs with aliases in ORDER BY", () => {
        const sql = "SELECT * FROM tbl x JOIN tbl1 y ORDER BY ";
        const col = colHint(sql);
        if (col?.kind === "column") {
            expect(col.tableRefs.length).toBe(2);
        }
    });

    it("handles qualified access in ORDER BY", () => {
        const sql = "SELECT * FROM tbl x JOIN tbl1 y ORDER BY x.";
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("x");
        }
    });
});

// ============================================================================
// RETURNING context
// ============================================================================
describe("suggestType — RETURNING context", () => {
    it("suggests columns after RETURNING", () => {
        expect(hasHint("DELETE FROM users RETURNING ", "column")).toBe(true);
    });

    it("suggests columns after INSERT ... RETURNING", () => {
        expect(hasHint("INSERT INTO users (id) VALUES (1) RETURNING ", "column")).toBe(true);
    });

    it("INSERT RETURNING scopes columns to the insert target table", () => {
        const col = colHint("INSERT INTO users (id) VALUES (1) RETURNING ");
        expect(col).toBeDefined();
        expect(col?.kind === "column" && col.tableRefs.length).toBe(1);
        expect(col?.kind === "column" && col.tableRefs[0]?.name).toBe("users");
    });

    it("DELETE RETURNING scopes columns to the target table", () => {
        const col = colHint("DELETE FROM users RETURNING ");
        expect(col).toBeDefined();
        expect(col?.kind === "column" && col.tableRefs.length).toBe(1);
        expect(col?.kind === "column" && col.tableRefs[0]?.name).toBe("users");
    });

    it("suggests columns after UPDATE ... RETURNING", () => {
        expect(hasHint("UPDATE users SET name = 'x' RETURNING ", "column")).toBe(true);
    });
});

// ============================================================================
// Continuation tokens (, AND OR =)
// ============================================================================
describe("suggestType — continuation tokens", () => {
    it("continues SELECT context after comma", () => {
        const kinds = hintKinds("SELECT a, b, ");
        expect(kinds).toContain("column");
        expect(kinds).toContain("function");
    });

    it("continues FROM context after comma", () => {
        expect(hasHint("SELECT * FROM tbl1, ", "table")).toBe(true);
    });

    it("continues WHERE context after AND", () => {
        expect(hasHint("SELECT * FROM users WHERE id = 1 AND ", "column")).toBe(true);
    });

    it("continues WHERE context after OR", () => {
        expect(hasHint("SELECT * FROM users WHERE id = 1 OR ", "column")).toBe(true);
    });

    it("continues WHERE context after =", () => {
        expect(hasHint("SELECT * FROM users WHERE id = ", "column")).toBe(true);
    });

    it("handles unrecognized keyword gracefully in WHERE", () => {
        const col = colHint("SELECT * FROM sessions WHERE session = 1 AND ");
        expect(col).toBeDefined();
    });
});

// ============================================================================
// Multi-statement
// ============================================================================
describe("suggestType — multi-statement", () => {
    it("handles 2nd statement FROM context", () => {
        expect(hasHint("SELECT * FROM a; SELECT * FROM ", "table")).toBe(true);
    });

    it("handles 2nd statement SELECT context", () => {
        const sql = "SELECT * FROM a; SELECT  FROM b";
        const cursor = "SELECT * FROM a; SELECT ".length;
        expect(hasHint(sql, "column", cursor)).toBe(true);
    });

    it("works even if first statement is invalid", () => {
        expect(hasHint("SELECT * FROM; SELECT * FROM ", "table")).toBe(true);
    });

    it("isolates 1st statement when 2nd exists", () => {
        const sql = "SELECT * FROM ; SELECT * FROM b";
        const cursor = "SELECT * FROM ".length;
        expect(hasHint(sql, "table", cursor)).toBe(true);
    });

    it("handles 3 statements, cursor in 2nd", () => {
        const sql = "SELECT * FROM a; SELECT * FROM ; SELECT * FROM c";
        const cursor = "SELECT * FROM a; SELECT * FROM ".length;
        expect(hasHint(sql, "table", cursor)).toBe(true);
    });
});

// ============================================================================
// CTE support
// ============================================================================
describe("suggestType — CTE support", () => {
    it("includes CTE names as local table names in FROM", () => {
        const sql = "WITH cte AS (SELECT 1) SELECT * FROM ";
        const tbl = tableHint(sql);
        expect(tbl).toBeDefined();
        if (tbl?.kind === "table") {
            expect(tbl.localTableNames).toContain("cte");
        }
    });

    it("includes multiple CTE names", () => {
        const sql = "WITH cte1 AS (SELECT 1), cte2 AS (SELECT 2) SELECT * FROM ";
        const tbl = tableHint(sql);
        if (tbl?.kind === "table") {
            expect(tbl.localTableNames).toContain("cte1");
            expect(tbl.localTableNames).toContain("cte2");
        }
    });

    it("handles RECURSIVE CTEs", () => {
        const sql = "WITH RECURSIVE tree AS (SELECT 1) SELECT * FROM ";
        const tbl = tableHint(sql);
        if (tbl?.kind === "table") {
            expect(tbl.localTableNames).toContain("tree");
        }
    });

    it("does not crash on complex CTE", () => {
        const sql = "WITH CTE AS (SELECT F.* FROM Foo F WHERE F.Bar > 23) SELECT C.* FROM CTE C WHERE C.FooID BETWEEN 123 AND 234;";
        for (let i = 0; i < sql.length; i++) {
            expect(() => suggestType(sql, i)).not.toThrow();
        }
    });
});

// ============================================================================
// Suppression (strings, comments, dollar-quotes)
// ============================================================================
describe("suggestType — suppression", () => {
    it("returns empty inside single-quoted string", () => {
        expect(hints("SELECT 'hello")).toEqual([]);
    });

    it("returns empty inside double-quoted identifier", () => {
        expect(hints('SELECT "incomplete_ident')).toEqual([]);
    });

    it("returns empty inside line comment", () => {
        expect(hints("SELECT -- comment")).toEqual([]);
    });

    it("returns empty inside block comment", () => {
        expect(hints("SELECT /* comment")).toEqual([]);
    });

    it("returns empty inside dollar-quoted string", () => {
        expect(hints("SELECT $$ some body text")).toEqual([]);
    });

    it("returns empty inside named dollar-quoted string", () => {
        expect(hints("SELECT $fn$ function body")).toEqual([]);
    });

    it("resumes after closed string", () => {
        const kinds = hintKinds("SELECT 'hello' FROM ");
        expect(kinds).toContain("table");
    });

    it("resumes after closed block comment", () => {
        const kinds = hintKinds("SELECT /* comment */ * FROM ");
        expect(kinds).toContain("table");
    });

    it("resumes after closed dollar-quote", () => {
        const kinds = hintKinds("SELECT $$ body $$ FROM ");
        expect(kinds.length).toBeGreaterThan(0);
    });

    it("ignores comments before current statement", () => {
        const kinds = hintKinds("SELECT 1;\n-- from users\nSELECT * FROM ");
        expect(kinds).toContain("table");
    });

    it("handles function body in dollar-quotes with inner SELECT", () => {
        const sql = `CREATE OR REPLACE FUNCTION func() RETURNS setof int AS $$
SELECT  FROM foo;
SELECT 2 FROM bar;
$$ language sql;`;
        // Cursor inside $$ ... $$ → suppressed
        const insideCursor = sql.indexOf("SELECT  FROM foo") + "SELECT ".length;
        expect(hints(sql, insideCursor)).toEqual([]);
    });

    it("resumes after function body in dollar-quotes", () => {
        const sql = `CREATE OR REPLACE FUNCTION func() RETURNS setof int AS $$
SELECT 1 FROM foo;
$$ language sql;
SELECT * FROM `;
        expect(hasHint(sql, "table")).toBe(true);
    });
});

// ============================================================================
// Subquery context
// ============================================================================
describe("suggestType — subquery context", () => {
    it("suggests keywords after ( in SELECT", () => {
        const kinds = hintKinds("SELECT * FROM (");
        expect(kinds).toContain("keyword");
    });

    it("suggests keywords after WHERE EXISTS (", () => {
        const kinds = hintKinds("SELECT * FROM foo WHERE EXISTS (");
        expect(kinds).toContain("keyword");
    });

    it("suggests keywords after WHERE ... AND NOT EXISTS (", () => {
        const kinds = hintKinds("SELECT * FROM foo WHERE bar AND NOT EXISTS (");
        expect(kinds).toContain("keyword");
    });

    it("suggests keywords for partial text after subquery open: (S", () => {
        const kinds = hintKinds("SELECT * FROM (S");
        expect(kinds).toContain("keyword");
    });

    it("suggests tables in subquery FROM", () => {
        expect(hasHint("SELECT * FROM (SELECT * FROM ", "table")).toBe(true);
    });

    it("suggests tables in EXISTS subquery FROM", () => {
        expect(hasHint("SELECT * FROM foo WHERE EXISTS (SELECT * FROM ", "table")).toBe(true);
    });

    it("suggests columns in subquery SELECT", () => {
        const sql = "SELECT * FROM (SELECT  FROM abc";
        const cursor = "SELECT * FROM (SELECT ".length;
        expect(hasHint(sql, "column", cursor)).toBe(true);
    });

    it("tracks table refs from inner subquery tables when before cursor", () => {
        // abc is after cursor — the engine only parses text before cursor
        // but if cursor is after FROM abc, it should track it
        const sql = "SELECT * FROM (SELECT * FROM abc WHERE ";
        const col = colHint(sql);
        if (col?.kind === "column") {
            expect(col.tableRefs.some((r) => r.name === "abc")).toBe(true);
        }
    });

    it("accesses outer table ref via qualifier in EXISTS subquery", () => {
        const sql = 'SELECT * FROM foo f WHERE EXISTS (SELECT 1 FROM bar WHERE f.';
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("f");
            expect(q.tableRefs.some((r) => r.name === "foo" && r.alias === "f")).toBe(true);
        }
    });

    it("accesses outer table in EXISTS with AND join condition", () => {
        const sql = "SELECT * FROM foo f WHERE EXISTS (SELECT 1 FROM bar b WHERE b.id = f.";
        const q = qualHint(sql);
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("f");
        }
    });

    it("suggests dot-qualified column in subquery SELECT", () => {
        const sql = "SELECT * FROM (SELECT t. FROM tabl t";
        const cursor = "SELECT * FROM (SELECT t.".length;
        const q = qualHint(sql, cursor);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("t");
        }
    });
});

// ============================================================================
// Edge cases from pgcli
// ============================================================================
describe("suggestType — edge cases", () => {
    it("handles leading parenthesis without crash", () => {
        expect(() => suggestType("(", 1)).not.toThrow();
    });

    it("handles leading comma gracefully", () => {
        expect(() => suggestType(",", 1)).not.toThrow();
    });

    it("handles whitespace-comma gracefully", () => {
        expect(() => suggestType("  ,", 3)).not.toThrow();
    });

    it("handles 'sel ,' gracefully", () => {
        expect(() => suggestType("sel ,", 5)).not.toThrow();
    });

    it("handles empty parens in INSERT", () => {
        const sql = "INSERT INTO users ()";
        const cursor = sql.indexOf("(") + 1;
        expect(() => suggestType(sql, cursor)).not.toThrow();
    });

    it("handles newlines in multiline queries", () => {
        const sql = "SELECT *\nFROM users\nWHERE ";
        expect(hasHint(sql, "column")).toBe(true);
    });

    it("handles tabs and mixed whitespace", () => {
        const sql = "SELECT\t*\tFROM\tusers\tWHERE\t";
        expect(hasHint(sql, "column")).toBe(true);
    });

    it("does not crash on very long query", () => {
        const sql = "SELECT " + Array.from({ length: 100 }, (_, i) => `col${i}`).join(", ") + " FROM users WHERE ";
        expect(() => suggestType(sql, sql.length)).not.toThrow();
        expect(hasHint(sql, "column")).toBe(true);
    });

    it("handles double semicolons", () => {
        expect(() => suggestType("SELECT 1;; SELECT ", 18)).not.toThrow();
    });

    it("handles escaped single quotes", () => {
        const sql = "SELECT * FROM foo WHERE bar = 'it''s' AND ";
        expect(hasHint(sql, "column")).toBe(true);
    });
});

// ============================================================================
// VALUES context
// ============================================================================
describe("suggestType — VALUES context", () => {
    it("suggests keywords after VALUES", () => {
        const kw = kwHint("INSERT INTO users (id) VALUES ");
        expect(kw).toBeDefined();
        if (kw?.kind === "keyword") {
            expect(kw.lastToken).toBe("VALUES");
        }
    });

    it("suggests values hint at position 0 inside VALUES (", () => {
        const sql = "INSERT INTO users (id, name) VALUES (";
        const allHints = hints(sql);
        const valuesHint = allHints.find((h) => h.kind === "values");
        expect(valuesHint).toBeDefined();
        if (valuesHint?.kind === "values") {
            expect(valuesHint.position).toBe(0);
            expect(valuesHint.columns).toEqual(["id", "name"]);
            expect(valuesHint.tableRefs[0]?.name).toBe("users");
        }
    });

    it("suggests values hint at position 1 after first comma", () => {
        const sql = "INSERT INTO users (id, name) VALUES (1, ";
        const allHints = hints(sql);
        const valuesHint = allHints.find((h) => h.kind === "values");
        expect(valuesHint).toBeDefined();
        if (valuesHint?.kind === "values") {
            expect(valuesHint.position).toBe(1);
            expect(valuesHint.columns).toEqual(["id", "name"]);
        }
    });

    it("suggests values hint at position 2 after two commas", () => {
        const sql = "INSERT INTO users (id, name, email) VALUES (1, 'test', ";
        const allHints = hints(sql);
        const valuesHint = allHints.find((h) => h.kind === "values");
        if (valuesHint?.kind === "values") {
            expect(valuesHint.position).toBe(2);
            expect(valuesHint.columns).toEqual(["id", "name", "email"]);
        }
    });

    it("provides empty columns array when no explicit column list", () => {
        const sql = "INSERT INTO users VALUES (";
        const allHints = hints(sql);
        const valuesHint = allHints.find((h) => h.kind === "values");
        expect(valuesHint).toBeDefined();
        if (valuesHint?.kind === "values") {
            expect(valuesHint.position).toBe(0);
            expect(valuesHint.columns).toEqual([]);
        }
    });

    it("includes function hints alongside values hint", () => {
        const sql = "INSERT INTO users (id) VALUES (";
        expect(hasHint(sql, "values")).toBe(true);
        expect(hasHint(sql, "function")).toBe(true);
    });

    it("suggests values hint at position 0 for second row: VALUES (...), (", () => {
        const sql = "INSERT INTO users (id, name) VALUES (1, 'a'), (";
        const allHints = hints(sql);
        const valuesHint = allHints.find((h) => h.kind === "values");
        expect(valuesHint).toBeDefined();
        if (valuesHint?.kind === "values") {
            expect(valuesHint.position).toBe(0);
            expect(valuesHint.columns).toEqual(["id", "name"]);
        }
    });

    it("suggests values hint at position 1 for second row comma", () => {
        const sql = "INSERT INTO users (id, name) VALUES (1, 'a'), (2, ";
        const allHints = hints(sql);
        const valuesHint = allHints.find((h) => h.kind === "values");
        expect(valuesHint).toBeDefined();
        if (valuesHint?.kind === "values") {
            expect(valuesHint.position).toBe(1);
        }
    });

    it("suggests values hint for third row", () => {
        const sql = "INSERT INTO users (id, name) VALUES (1, 'a'), (2, 'b'), (";
        const allHints = hints(sql);
        const valuesHint = allHints.find((h) => h.kind === "values");
        expect(valuesHint).toBeDefined();
        if (valuesHint?.kind === "values") {
            expect(valuesHint.position).toBe(0);
        }
    });
});

// ============================================================================
// Multiple joins — column tracking
// ============================================================================
describe("suggestType — multiple joins tracking", () => {
    it("tracks all tables across multiple joins", () => {
        const sql = "SELECT * FROM t1 INNER JOIN t2 ON t1.id = t2.t1_id INNER JOIN t3 ON t2.id = t3.";
        const q = qualHint(sql);
        expect(q).toBeDefined();
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("t3");
            const names = q.tableRefs.map((r) => r.name);
            expect(names).toContain("t1");
            expect(names).toContain("t2");
            expect(names).toContain("t3");
        }
    });

    it("tracks tables with aliases across three joins", () => {
        const sql = `SELECT * FROM users u1
            INNER JOIN users u2 ON u1.id = u2.id
            INNER JOIN users u3 ON u2.id = u3.`;
        const q = qualHint(sql);
        if (q?.kind === "qualified") {
            expect(q.qualifier).toBe("u3");
        }
    });
});

// ============================================================================
// SET search_path TO — schema suggestions
// ============================================================================
describe("SET search_path TO", () => {
    it("SET search_path TO → schema", () => {
        const hints = suggestType("SET search_path TO ", 19);
        expect(hints).toEqual([{ kind: "schema" }]);
    });

    it("SET search_path = → schema", () => {
        const hints = suggestType("SET search_path = ", 18);
        expect(hints).toEqual([{ kind: "schema" }]);
    });

    it("SET search_path TO public, → schema (comma continuation)", () => {
        const hints = suggestType("SET search_path TO public, ", 27);
        expect(hints).toEqual([{ kind: "schema" }]);
    });

    it("SET in UPDATE context still suggests columns", () => {
        const hints = suggestType("UPDATE users SET ", 17);
        expect(hints.some((h) => h.kind === "column")).toBe(true);
        expect(hints.some((h) => h.kind === "schema")).toBe(false);
    });

    it("SET without search_path suggests keywords", () => {
        const hints = suggestType("SET ", 4);
        expect(hints).toEqual([{ kind: "keyword", lastToken: "SET" }]);
    });
});

// ============================================================================
// EXISTS( — keyword-only subquery hint
// ============================================================================
describe("EXISTS(", () => {
    it("EXISTS( → keyword hint for SELECT subquery", () => {
        const hints = suggestType("SELECT * FROM users WHERE EXISTS(", 33);
        expect(hints).toEqual([{ kind: "keyword", lastToken: "EXISTS" }]);
    });

    it("NOT EXISTS( → keyword hint", () => {
        const hints = suggestType("SELECT * FROM users WHERE NOT EXISTS(", 37);
        expect(hints).toEqual([{ kind: "keyword", lastToken: "EXISTS" }]);
    });

    it("regular paren after WHERE still suggests expressions", () => {
        const hints = suggestType("SELECT * FROM users WHERE (", 27);
        expect(hints.some((h) => h.kind === "column" || h.kind === "function")).toBe(true);
    });
});

// ============================================================================
// Datatype hints in CREATE TABLE / FUNCTION parens
// ============================================================================
describe("Datatype hints in DDL parens", () => {
    it("CREATE TABLE foo (id → datatype", () => {
        const sql = "CREATE TABLE foo (id ";
        const hints = suggestType(sql, sql.length);
        expect(hints.some((h) => h.kind === "datatype")).toBe(true);
    });

    it("CREATE TABLE foo (name varchar, email → datatype", () => {
        const sql = "CREATE TABLE foo (name varchar, email ";
        const hints = suggestType(sql, sql.length);
        expect(hints.some((h) => h.kind === "datatype")).toBe(true);
    });

    it("CREATE TABLE includes schema hint for types", () => {
        const sql = "CREATE TABLE foo (id ";
        const hints = suggestType(sql, sql.length);
        expect(hints.some((h) => h.kind === "schema")).toBe(true);
    });

    it("CREATE FUNCTION foo(arg → datatype", () => {
        const sql = "CREATE FUNCTION foo(arg ";
        const hints = suggestType(sql, sql.length);
        expect(hints.some((h) => h.kind === "datatype")).toBe(true);
    });

    it("does not suggest datatype outside CREATE context", () => {
        const sql = "SELECT foo (id ";
        const hints = suggestType(sql, sql.length);
        expect(hints.some((h) => h.kind === "datatype")).toBe(false);
    });

    it("does not suggest datatype after closing paren", () => {
        const sql = "CREATE TABLE foo (id integer) ";
        const hints = suggestType(sql, sql.length);
        expect(hints.some((h) => h.kind === "datatype")).toBe(false);
    });
});

// ============================================================================
// Window function OVER () clause
// ============================================================================
describe("suggestType — OVER clause", () => {
    it("suggests OVER keywords and columns after OVER (", () => {
        const sql = "SELECT row_number() OVER (";
        expect(hasHint(sql, "keyword")).toBe(true);
        expect(hasHint(sql, "column")).toBe(true);
        const kw = kwHint(sql);
        expect(kw?.kind === "keyword" && kw.lastToken).toBe("OVER");
    });

    it("suggests columns after PARTITION BY", () => {
        const sql = "SELECT row_number() OVER (PARTITION BY ";
        expect(hasHint(sql, "column")).toBe(true);
        expect(hasHint(sql, "function")).toBe(true);
    });

    it("suggests columns after ORDER BY inside OVER", () => {
        const sql = "SELECT rank() OVER (ORDER BY ";
        expect(hasHint(sql, "column")).toBe(true);
        expect(hasHint(sql, "function")).toBe(true);
    });

    it("suggests columns after PARTITION BY col, (comma continuation)", () => {
        const sql = "SELECT row_number() OVER (PARTITION BY a, ";
        expect(hasHint(sql, "column")).toBe(true);
    });

    it("suggests sort direction after ORDER BY col inside OVER", () => {
        const sql = "SELECT rank() OVER (ORDER BY created_at ";
        expect(hasHint(sql, "keyword")).toBe(true);
        const kw = kwHint(sql);
        expect(kw?.kind === "keyword" && kw.lastToken).toBe("ORDER_DIRECTION");
    });

    it("suggests ORDER BY after PARTITION BY col (continuation)", () => {
        const sql = "SELECT row_number() OVER (PARTITION BY dept_id ";
        expect(hasHint(sql, "keyword")).toBe(true);
        // Should still offer ORDER BY since it hasn't appeared yet
        const allHints = hints(sql);
        const kwHints = allHints.filter((h) => h.kind === "keyword");
        expect(kwHints.some((h) => h.kind === "keyword" && h.lastToken === "OVER")).toBe(true);
    });

    it("suggests columns after ORDER BY inside complex OVER", () => {
        const sql = "SELECT dense_rank() OVER (PARTITION BY dept ORDER BY ";
        expect(hasHint(sql, "column")).toBe(true);
    });

    it("does not trigger OVER detection for regular parentheses", () => {
        const sql = "SELECT count(";
        const kw = kwHint(sql);
        // Should NOT produce OVER keyword
        expect(kw?.kind === "keyword" && kw.lastToken === "OVER").toBe(false);
    });

    it("supports qualified access inside OVER clause", () => {
        const sql = "SELECT row_number() OVER (PARTITION BY t.";
        expect(hasHint(sql, "qualified")).toBe(true);
    });
});

// ============================================================================
// Subquery alias resolution
// ============================================================================
describe("Subquery alias column completions", () => {
    it("suggests qualified hint for subquery alias", () => {
        const sql = "SELECT * FROM (SELECT id, name FROM users) sub WHERE sub.";
        const hints = suggestType(sql, sql.length);
        const qualified = hints.find((h) => h.kind === "qualified");
        expect(qualified).toBeDefined();
    });

    it("includes subquery columns in cteColumns for resolution", () => {
        const sql = "SELECT * FROM (SELECT id, name FROM users) sub WHERE sub.";
        const hints = suggestType(sql, sql.length);
        const qualified = hints.find((h) => h.kind === "qualified");
        expect(qualified).toBeDefined();
        if (qualified?.kind === "qualified") {
            expect(qualified.cteColumns.get("sub")).toEqual(["id", "name"]);
        }
    });

    it("suggests qualified hint for subquery alias with AS", () => {
        const sql = "SELECT * FROM (SELECT id, email AS e FROM users) AS s WHERE s.";
        const hints = suggestType(sql, sql.length);
        const qualified = hints.find((h) => h.kind === "qualified");
        expect(qualified).toBeDefined();
        if (qualified?.kind === "qualified") {
            expect(qualified.cteColumns.get("s")).toEqual(["id", "e"]);
        }
    });
});
