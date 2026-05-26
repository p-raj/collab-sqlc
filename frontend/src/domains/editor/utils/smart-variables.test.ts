import { describe, expect, it } from "vitest";
import {
    extractSmartVariables,
    formatForSql,
    substituteSmartVariables,
} from "./smart-variables";
import type { SmartVariable } from "./smart-variables";

// ---------------------------------------------------------------------------
// extractSmartVariables
// ---------------------------------------------------------------------------
describe("extractSmartVariables", () => {
    it("extracts {name:type} variables", () => {
        const vars = extractSmartVariables("SELECT * FROM t WHERE status = {status:text}");
        expect(vars).toEqual([
            { name: "status", type: "text", token: "{status:text}" },
        ]);
    });

    it("defaults to text when type is omitted", () => {
        const vars = extractSmartVariables("WHERE id = {id}");
        expect(vars).toEqual([
            { name: "id", type: "text", token: "{id}" },
        ]);
    });

    it("extracts multiple typed variables", () => {
        const sql = "WHERE age > {min_age:number} AND status IN ({statuses:list})";
        const vars = extractSmartVariables(sql);
        expect(vars).toHaveLength(2);
        expect(vars[0]).toMatchObject({ name: "min_age", type: "number" });
        expect(vars[1]).toMatchObject({ name: "statuses", type: "list" });
    });

    it("extracts legacy $var syntax", () => {
        const vars = extractSmartVariables("WHERE id = $user_id");
        expect(vars).toEqual([
            { name: "user_id", type: "text", token: "$user_id" },
        ]);
    });

    it("ignores placeholders inside strings and comments", () => {
        const sql = "SELECT '$status' AS literal -- $ignored\nWHERE id = {id:number}";
        const vars = extractSmartVariables(sql);
        expect(vars).toEqual([
            { name: "id", type: "number", token: "{id:number}" },
        ]);
    });

    it("ignores placeholders inside dollar-quoted bodies", () => {
        const sql = "SELECT $fn$ $ignored {name:text} $fn$ AS body, {id:number}";
        const vars = extractSmartVariables(sql);
        expect(vars).toEqual([
            { name: "id", type: "number", token: "{id:number}" },
        ]);
    });

    it("smart var takes precedence over legacy with same name", () => {
        const sql = "WHERE id = {status:boolean} AND x = $status";
        const vars = extractSmartVariables(sql);
        expect(vars).toHaveLength(1);
        expect(vars[0]).toMatchObject({ name: "status", type: "boolean", token: "{status:boolean}" });
    });

    it("deduplicates same smart var appearing multiple times", () => {
        const sql = "WHERE a = {x:number} OR b = {x:number}";
        const vars = extractSmartVariables(sql);
        expect(vars).toHaveLength(1);
    });

    it("handles mixed legacy and smart variables", () => {
        const sql = "WHERE a = $legacy AND b = {smart:date}";
        const vars = extractSmartVariables(sql);
        expect(vars).toHaveLength(2);
        expect(vars[0]).toMatchObject({ name: "smart", type: "date" });
        expect(vars[1]).toMatchObject({ name: "legacy", type: "text" });
    });

    it("treats unknown type as text", () => {
        const vars = extractSmartVariables("WHERE x = {val:banana}");
        expect(vars[0]!.type).toBe("text");
    });

    it("supports all valid types", () => {
        const types = ["text", "number", "boolean", "date", "datetime", "list"] as const;
        for (const t of types) {
            const vars = extractSmartVariables(`{v:${t}}`);
            expect(vars[0]!.type).toBe(t);
        }
    });

    it("returns empty for no variables", () => {
        expect(extractSmartVariables("SELECT 1")).toEqual([]);
    });

    it("does not match inside curly braces without valid name", () => {
        expect(extractSmartVariables("WHERE x = {123}")).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// formatForSql
// ---------------------------------------------------------------------------
describe("formatForSql", () => {
    describe("text", () => {
        it("quotes the value", () => {
            expect(formatForSql("hello", "text")).toBe("'hello'");
        });

        it("escapes single quotes", () => {
            expect(formatForSql("it's", "text")).toBe("'it''s'");
        });

        it("returns NULL for empty string", () => {
            expect(formatForSql("", "text")).toBe("NULL");
        });
    });

    describe("number", () => {
        it("passes through valid integers", () => {
            expect(formatForSql("42", "number")).toBe("42");
        });

        it("passes through decimals", () => {
            expect(formatForSql("3.14", "number")).toBe("3.14");
        });

        it("passes through negative numbers", () => {
            expect(formatForSql("-7", "number")).toBe("-7");
        });

        it("returns NULL for non-numeric", () => {
            expect(formatForSql("abc", "number")).toBe("NULL");
        });

        it("returns NULL for empty", () => {
            expect(formatForSql("", "number")).toBe("NULL");
        });
    });

    describe("boolean", () => {
        it("maps true values", () => {
            expect(formatForSql("true", "boolean")).toBe("TRUE");
            expect(formatForSql("TRUE", "boolean")).toBe("TRUE");
            expect(formatForSql("1", "boolean")).toBe("TRUE");
            expect(formatForSql("yes", "boolean")).toBe("TRUE");
        });

        it("maps false values", () => {
            expect(formatForSql("false", "boolean")).toBe("FALSE");
            expect(formatForSql("FALSE", "boolean")).toBe("FALSE");
            expect(formatForSql("0", "boolean")).toBe("FALSE");
            expect(formatForSql("no", "boolean")).toBe("FALSE");
        });

        it("returns NULL for unrecognized", () => {
            expect(formatForSql("maybe", "boolean")).toBe("NULL");
        });
    });

    describe("date", () => {
        it("quotes the date string", () => {
            expect(formatForSql("2024-01-15", "date")).toBe("'2024-01-15'");
        });

        it("returns NULL for empty", () => {
            expect(formatForSql("", "date")).toBe("NULL");
        });
    });

    describe("datetime", () => {
        it("quotes the datetime string", () => {
            expect(formatForSql("2024-01-15 09:30:00", "datetime")).toBe("'2024-01-15 09:30:00'");
        });
    });

    describe("list", () => {
        it("splits and quotes comma-separated values", () => {
            expect(formatForSql("in, out, pending", "list")).toBe("'in', 'out', 'pending'");
        });

        it("handles single item", () => {
            expect(formatForSql("active", "list")).toBe("'active'");
        });

        it("trims whitespace around items", () => {
            expect(formatForSql("  a , b , c  ", "list")).toBe("'a', 'b', 'c'");
        });

        it("filters empty items", () => {
            expect(formatForSql("a,,b", "list")).toBe("'a', 'b'");
        });

        it("escapes quotes in list items", () => {
            expect(formatForSql("it's, fine", "list")).toBe("'it''s', 'fine'");
        });

        it("does not quote all-numeric items", () => {
            expect(formatForSql("1, 2, 3, 4", "list")).toBe("1, 2, 3, 4");
        });

        it("does not quote single numeric item", () => {
            expect(formatForSql("42", "list")).toBe("42");
        });

        it("does not quote decimals", () => {
            expect(formatForSql("1.5, 2.7", "list")).toBe("1.5, 2.7");
        });

        it("quotes when mix of numbers and strings", () => {
            expect(formatForSql("1, abc, 3", "list")).toBe("'1', 'abc', '3'");
        });

        it("returns NULL for empty", () => {
            expect(formatForSql("", "list")).toBe("NULL");
        });
    });
});

// ---------------------------------------------------------------------------
// substituteSmartVariables
// ---------------------------------------------------------------------------
describe("substituteSmartVariables", () => {
    it("substitutes a typed text variable with quoting", () => {
        const vars: SmartVariable[] = [{ name: "status", type: "text", token: "{status:text}" }];
        const result = substituteSmartVariables(
            "WHERE status = {status:text}",
            vars,
            { status: "active" },
        );
        expect(result).toBe("WHERE status = 'active'");
    });

    it("substitutes a number variable without quoting", () => {
        const vars: SmartVariable[] = [{ name: "age", type: "number", token: "{age:number}" }];
        const result = substituteSmartVariables(
            "WHERE age > {age:number}",
            vars,
            { age: "18" },
        );
        expect(result).toBe("WHERE age > 18");
    });

    it("substitutes a boolean variable", () => {
        const vars: SmartVariable[] = [{ name: "active", type: "boolean", token: "{active:boolean}" }];
        const result = substituteSmartVariables(
            "WHERE is_active = {active:boolean}",
            vars,
            { active: "yes" },
        );
        expect(result).toBe("WHERE is_active = TRUE");
    });

    it("substitutes a list variable for IN clause", () => {
        const vars: SmartVariable[] = [{ name: "statuses", type: "list", token: "{statuses:list}" }];
        const result = substituteSmartVariables(
            "WHERE status IN ({statuses:list})",
            vars,
            { statuses: "in, out, pending" },
        );
        expect(result).toBe("WHERE status IN ('in', 'out', 'pending')");
    });

    it("substitutes legacy $var with raw interpolation", () => {
        const vars: SmartVariable[] = [{ name: "name", type: "text", token: "$name" }];
        const result = substituteSmartVariables(
            "ORDER BY $name",
            vars,
            { name: "created_at DESC" },
        );
        expect(result).toBe("ORDER BY created_at DESC");
    });

    it("handles multiple variables", () => {
        const vars: SmartVariable[] = [
            { name: "status", type: "text", token: "{status:text}" },
            { name: "min_age", type: "number", token: "{min_age:number}" },
        ];
        const result = substituteSmartVariables(
            "WHERE status = {status:text} AND age > {min_age:number}",
            vars,
            { status: "active", min_age: "21" },
        );
        expect(result).toBe("WHERE status = 'active' AND age > 21");
    });

    it("replaces all occurrences of the same variable", () => {
        const vars: SmartVariable[] = [{ name: "id", type: "number", token: "{id:number}" }];
        const result = substituteSmartVariables(
            "WHERE a = {id:number} OR b = {id:number}",
            vars,
            { id: "5" },
        );
        expect(result).toBe("WHERE a = 5 OR b = 5");
    });

    it("uses NULL for missing values", () => {
        const vars: SmartVariable[] = [{ name: "x", type: "text", token: "{x:text}" }];
        const result = substituteSmartVariables("WHERE x = {x:text}", vars, {});
        expect(result).toBe("WHERE x = NULL");
    });

    it("handles date substitution", () => {
        const vars: SmartVariable[] = [{ name: "d", type: "date", token: "{d:date}" }];
        const result = substituteSmartVariables(
            "WHERE created_at >= {d:date}",
            vars,
            { d: "2024-01-15" },
        );
        expect(result).toBe("WHERE created_at >= '2024-01-15'");
    });

    it("does not have the $id/$id2 overlap bug", () => {
        const vars: SmartVariable[] = [
            { name: "id", type: "number", token: "{id:number}" },
            { name: "id2", type: "number", token: "{id2:number}" },
        ];
        const result = substituteSmartVariables(
            "WHERE a = {id:number} AND b = {id2:number}",
            vars,
            { id: "1", id2: "2" },
        );
        expect(result).toBe("WHERE a = 1 AND b = 2");
    });

    it("replaces smart and legacy tokens with the same name", () => {
        const vars = extractSmartVariables("SELECT {limit:number} AS n FROM t LIMIT $limit");
        const result = substituteSmartVariables(
            "SELECT {limit:number} AS n FROM t LIMIT $limit",
            vars,
            { limit: "10" },
        );
        expect(result).toBe("SELECT 10 AS n FROM t LIMIT 10");
    });

    it("does not substitute placeholders inside strings or comments", () => {
        const sql = "SELECT '$status' AS literal -- $ignored\nWHERE id = {id:number}";
        const vars = extractSmartVariables(sql);
        const result = substituteSmartVariables(sql, vars, { status: "x", ignored: "y", id: "7" });
        expect(result).toBe("SELECT '$status' AS literal -- $ignored\nWHERE id = 7");
    });
});
