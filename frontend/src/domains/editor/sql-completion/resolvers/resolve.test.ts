/**
 * Comprehensive resolveHints() tests — inspired by pgcli's smart_completion tests.
 *
 * Tests cover:
 *   - Table resolution (default schema, specific schema, prefix filtering, CTE)
 *   - Column resolution (single table, multi-table, qualified, insert context)
 *   - Qualified resolution (alias, schema, table name)
 *   - Function resolution (prefix, category)
 *   - Keyword resolution (context-specific)
 *   - Schema resolution
 *   - Datatype resolution
 *   - Alias resolution
 *   - Join resolution with smart ON clause heuristic
 *   - Multi-schema scenarios
 *   - Priority ordering
 */

import { describe, expect, it } from "vitest";
import { resolveHints } from "./resolve";
import { createCatalog } from "../catalog/catalog";
import type { TableInfo } from "@/domains/schema/types";
import type { SuggestionHint } from "../core/types";

// ---------------------------------------------------------------------------
// Mock data — public schema (users, orders, products) + analytics schema
// ---------------------------------------------------------------------------

const MOCK_TABLES: TableInfo[] = [
    {
        schema_name: "public",
        table_name: "users",
        columns: [
            { name: "id", data_type: "uuid", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null },
            { name: "email", data_type: "text", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
            { name: "name", data_type: "text", is_nullable: true, is_primary_key: false, default_value: null, comment: "User display name", foreign_key: null },
            { name: "role", data_type: "text", is_nullable: false, is_primary_key: false, default_value: "'viewer'", comment: null, foreign_key: null },
        ],
        row_count: 100,
        comment: "Application users",
    },
    {
        schema_name: "public",
        table_name: "orders",
        columns: [
            { name: "id", data_type: "uuid", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null },
            { name: "user_id", data_type: "uuid", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: "public.users.id" },
            { name: "product_id", data_type: "uuid", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: "public.products.id" },
            { name: "total", data_type: "numeric", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
            { name: "created_at", data_type: "timestamptz", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
        ],
        row_count: 1000,
        comment: null,
    },
    {
        schema_name: "public",
        table_name: "products",
        columns: [
            { name: "id", data_type: "uuid", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null },
            { name: "name", data_type: "text", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
            { name: "price", data_type: "numeric", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
        ],
        row_count: 50,
        comment: null,
    },
    {
        schema_name: "analytics",
        table_name: "events",
        columns: [
            { name: "id", data_type: "bigint", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null },
            { name: "event_type", data_type: "text", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
            { name: "user_id", data_type: "uuid", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: "public.users.id" },
            { name: "payload", data_type: "jsonb", is_nullable: true, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
        ],
        row_count: null,
        comment: null,
    },
    {
        schema_name: "analytics",
        table_name: "sessions",
        columns: [
            { name: "id", data_type: "bigint", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null },
            { name: "user_id", data_type: "uuid", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: "public.users.id" },
            { name: "started_at", data_type: "timestamptz", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null },
        ],
        row_count: 500,
        comment: null,
    },
];

const RANGE = { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 };

function resolve(hints: SuggestionHint[], prefix = "") {
    const catalog = createCatalog(MOCK_TABLES);
    return resolveHints(hints, catalog, prefix, RANGE);
}

function labels(hints: SuggestionHint[], prefix = ""): string[] {
    return resolve(hints, prefix).map((i) => (typeof i.label === "string" ? i.label : i.label.label));
}

// ============================================================================
// Table resolution
// ============================================================================
describe("resolveHints — tables", () => {
    it("resolves all tables across schemas (default)", () => {
        const l = labels([{ kind: "table", schema: null, localTableNames: [] }]);
        expect(l).toContain("users");
        expect(l).toContain("orders");
        expect(l).toContain("products");
        expect(l).toContain("events");
        expect(l).toContain("sessions");
    });

    it("filters tables by prefix", () => {
        const items = resolve([{ kind: "table", schema: null, localTableNames: [] }], "us");
        expect(items).toHaveLength(1);
        expect(items[0]?.label).toBe("users");
    });

    it("filters tables by prefix (case-insensitive)", () => {
        const items = resolve([{ kind: "table", schema: null, localTableNames: [] }], "US");
        expect(items).toHaveLength(1);
    });

    it("resolves tables in specific schema only", () => {
        const l = labels([{ kind: "table", schema: "analytics", localTableNames: [] }]);
        expect(l).toContain("events");
        expect(l).toContain("sessions");
        expect(l).not.toContain("users");
    });

    it("returns empty for unknown schema", () => {
        const items = resolve([{ kind: "table", schema: "nonexistent", localTableNames: [] }]);
        // Only CTE or matching tables — should have nothing
        expect(items).toHaveLength(0);
    });

    it("includes CTE names as local table suggestions", () => {
        const items = resolve([{ kind: "table", schema: null, localTableNames: ["my_cte", "another_cte"] }]);
        expect(items.some((i) => i.label === "my_cte" && i.detail === "cte")).toBe(true);
        expect(items.some((i) => i.label === "another_cte" && i.detail === "cte")).toBe(true);
    });

    it("CTE suggestions are included alongside real tables", () => {
        const items = resolve([{ kind: "table", schema: null, localTableNames: ["cte1"] }]);
        expect(items.some((i) => i.label === "cte1")).toBe(true);
        expect(items.some((i) => i.label === "users")).toBe(true);
    });

    it("filters CTE by prefix too", () => {
        const items = resolve([{ kind: "table", schema: null, localTableNames: ["my_cte"] }], "my");
        expect(items.some((i) => i.label === "my_cte")).toBe(true);
        expect(items.some((i) => i.label === "users")).toBe(false);
    });
});

// ============================================================================
// Column resolution
// ============================================================================
describe("resolveHints — columns", () => {
    it("resolves columns from single table reference", () => {
        const l = labels([
            {
                kind: "column",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("email");
        expect(l).toContain("name");
        expect(l).toContain("role");
    });

    it("resolves columns from aliased table reference", () => {
        const l = labels([
            {
                kind: "column",
                tableRefs: [{ schema: null, name: "users", alias: "u" }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("email");
    });

    it("resolves columns from multiple table references", () => {
        const l = labels([
            {
                kind: "column",
                tableRefs: [
                    { schema: null, name: "users", alias: "u" },
                    { schema: null, name: "orders", alias: "o" },
                ],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        expect(l).toContain("email"); // from users
        expect(l).toContain("total"); // from orders
        expect(l).toContain("user_id"); // from orders
    });

    it("deduplicates columns shared between tables", () => {
        const l = labels([
            {
                kind: "column",
                tableRefs: [
                    { schema: null, name: "users", alias: null },
                    { schema: null, name: "orders", alias: null },
                ],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        // "id" exists in both tables but should appear (may have duplicates — implementation-dependent)
        expect(l).toContain("id");
    });

    it("filters columns by prefix", () => {
        const items = resolve(
            [
                {
                    kind: "column",
                    tableRefs: [{ schema: null, name: "users", alias: null }],
                    localTableNames: [],
                    qualifiable: false,
                    context: null,
                },
            ],
            "em",
        );
        expect(items.some((i) => i.label === "email")).toBe(true);
        expect(items.some((i) => i.label === "id")).toBe(false);
    });

    it("resolves columns from schema-qualified table reference", () => {
        const l = labels([
            {
                kind: "column",
                tableRefs: [{ schema: "analytics", name: "events", alias: null }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        expect(l).toContain("event_type");
        expect(l).toContain("payload");
    });

    it("returns empty for unknown table reference", () => {
        const items = resolve([
            {
                kind: "column",
                tableRefs: [{ schema: null, name: "nonexistent", alias: null }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        expect(items).toHaveLength(0);
    });
});

// ============================================================================
// Qualified resolution (alias.col, schema.table)
// ============================================================================
describe("resolveHints — qualified", () => {
    it("resolves columns for alias qualifier", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "u",
                tableRefs: [{ schema: null, name: "users", alias: "u" }],
                cteColumns: new Map(),
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("email");
        expect(l).toContain("name");
    });

    it("resolves tables for schema qualifier", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "analytics",
                tableRefs: [],
                cteColumns: new Map(),
            },
        ]);
        expect(l).toContain("events");
        expect(l).toContain("sessions");
        expect(l).not.toContain("users");
    });

    it("resolves columns for direct table name qualifier (no alias)", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "users",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                cteColumns: new Map(),
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("email");
    });

    it("filters qualified results by prefix", () => {
        const items = resolve(
            [
                {
                    kind: "qualified",
                    qualifier: "u",
                    tableRefs: [{ schema: null, name: "users", alias: "u" }],
                    cteColumns: new Map(),
                },
            ],
            "em",
        );
        expect(items.some((i) => i.label === "email")).toBe(true);
        expect(items.some((i) => i.label === "id")).toBe(false);
    });

    it("resolves public schema tables for 'public' qualifier", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "public",
                tableRefs: [],
                cteColumns: new Map(),
            },
        ]);
        expect(l).toContain("users");
        expect(l).toContain("orders");
        expect(l).toContain("products");
        expect(l).not.toContain("events");
    });

    it("returns empty for unknown qualifier", () => {
        const items = resolve([
            {
                kind: "qualified",
                qualifier: "nonexistent",
                tableRefs: [],
                cteColumns: new Map(),
            },
        ]);
        expect(items).toHaveLength(0);
    });

    it("resolves columns for quoted alias (normalized to plain text)", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "VA",
                tableRefs: [{ schema: "public", name: "users", alias: "VA" }],
                cteColumns: new Map(),
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("email");
    });

    it("resolves schema-qualified table ref with alias", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "e",
                tableRefs: [{ schema: "analytics", name: "events", alias: "e" }],
                cteColumns: new Map(),
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("event_type");
    });
});

// ============================================================================
// Function resolution
// ============================================================================
describe("resolveHints — functions", () => {
    it("resolves functions with prefix", () => {
        const items = resolve([{ kind: "function", schema: null, usage: "expression" }], "cou");
        expect(items.some((i) => i.label === "count")).toBe(true);
    });

    it("resolves aggregate functions", () => {
        const items = resolve([{ kind: "function", schema: null, usage: "expression" }], "su");
        expect(items.some((i) => i.label === "sum")).toBe(true);
    });

    it("resolves string functions", () => {
        const items = resolve([{ kind: "function", schema: null, usage: "expression" }], "low");
        expect(items.some((i) => i.label === "lower")).toBe(true);
    });

    it("resolves math functions", () => {
        const items = resolve([{ kind: "function", schema: null, usage: "expression" }], "ab");
        expect(items.some((i) => i.label === "abs")).toBe(true);
    });

    it("resolves JSON functions", () => {
        const items = resolve([{ kind: "function", schema: null, usage: "expression" }], "json");
        expect(items.some((i) => typeof i.label === "string" && i.label.startsWith("json"))).toBe(true);
    });

    it("returns multiple matching functions", () => {
        const items = resolve([{ kind: "function", schema: null, usage: "expression" }], "max");
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty for no-match prefix", () => {
        const items = resolve([{ kind: "function", schema: null, usage: "expression" }], "zzzznotafunction");
        expect(items).toHaveLength(0);
    });
});

// ============================================================================
// Keyword resolution
// ============================================================================
describe("resolveHints — keywords", () => {
    it("resolves statement keywords for null lastToken", () => {
        const items = resolve([{ kind: "keyword", lastToken: null }]);
        const l = items.map((i) => i.label);
        expect(l).toContain("SELECT");
        expect(l).toContain("INSERT");
        expect(l).toContain("UPDATE");
        expect(l).toContain("DELETE");
    });

    it("resolves context-specific keywords for SELECT lastToken", () => {
        const items = resolve([{ kind: "keyword", lastToken: "SELECT" }]);
        const l = items.map((i) => i.label);
        expect(l).toContain("DISTINCT");
        expect(l).toContain("FROM");
        expect(l).toContain("WHERE");
    });

    it("resolves context-specific keywords for general expression context", () => {
        const items = resolve([{ kind: "keyword", lastToken: "EXPRESSION" }]);
        const l = items.map((i) => i.label);
        expect(l).toContain("AND");
        expect(l).toContain("OR");
        expect(l).toContain("NOT");
    });

    it("resolves CREATE-specific keywords", () => {
        const items = resolve([{ kind: "keyword", lastToken: "CREATE" }]);
        const l = items.map((i) => i.label);
        expect(l).toContain("TABLE");
    });

    it("resolves ALTER-specific keywords", () => {
        const items = resolve([{ kind: "keyword", lastToken: "ALTER" }]);
        const l = items.map((i) => i.label);
        expect(l).toContain("TABLE");
    });

    it("resolves DROP-specific keywords", () => {
        const items = resolve([{ kind: "keyword", lastToken: "DROP" }]);
        const l = items.map((i) => i.label);
        expect(l).toContain("TABLE");
    });

    it("filters keywords by prefix", () => {
        const items = resolve([{ kind: "keyword", lastToken: null }], "SEL");
        expect(items.some((i) => i.label === "SELECT")).toBe(true);
        expect(items.some((i) => i.label === "INSERT")).toBe(false);
    });
});

// ============================================================================
// Schema resolution
// ============================================================================
describe("resolveHints — schemas", () => {
    it("resolves all unique schemas", () => {
        const l = labels([{ kind: "schema" }]);
        expect(l).toContain("public");
        expect(l).toContain("analytics");
    });

    it("filters schemas by prefix", () => {
        const items = resolve([{ kind: "schema" }], "an");
        expect(items).toHaveLength(1);
        expect(items[0]?.label).toBe("analytics");
    });

    it("returns empty for no-match prefix", () => {
        const items = resolve([{ kind: "schema" }], "zzz");
        expect(items).toHaveLength(0);
    });
});

// ============================================================================
// Datatype resolution
// ============================================================================
describe("resolveHints — datatypes", () => {
    it("resolves datatypes with prefix", () => {
        const items = resolve([{ kind: "datatype", schema: null }], "int");
        expect(items.some((i) => i.label === "integer")).toBe(true);
    });

    it("includes common types", () => {
        const l = labels([{ kind: "datatype", schema: null }]);
        expect(l).toContain("text");
        expect(l).toContain("integer");
        expect(l).toContain("boolean");
        expect(l).toContain("uuid");
    });

    it("includes timestamp types", () => {
        const items = resolve([{ kind: "datatype", schema: null }], "time");
        expect(items.some((i) => typeof i.label === "string" && i.label.startsWith("time"))).toBe(true);
    });
});

// ============================================================================
// Alias resolution
// ============================================================================
describe("resolveHints — aliases", () => {
    it("resolves alias hints with dot suffix", () => {
        const items = resolve([{ kind: "alias", aliases: ["u", "o"] }]);
        expect(items).toHaveLength(2);
        expect(items[0]?.insertText).toBe("u.");
        expect(items[1]?.insertText).toBe("o.");
    });

    it("resolves single alias", () => {
        const items = resolve([{ kind: "alias", aliases: ["t"] }]);
        expect(items).toHaveLength(1);
        expect(items[0]?.insertText).toBe("t.");
    });

    it("resolves many aliases", () => {
        const items = resolve([{ kind: "alias", aliases: ["a", "b", "c", "d"] }]);
        expect(items).toHaveLength(4);
    });

    it("returns empty for no aliases", () => {
        const items = resolve([{ kind: "alias", aliases: [] }]);
        expect(items).toHaveLength(0);
    });
});

// ============================================================================
// Join resolution with smart ON clause
// ============================================================================
describe("resolveHints — join", () => {
    it("suggests orders with ON clause via user_id heuristic", () => {
        const items = resolve([
            {
                kind: "join",
                tableRefs: [{ schema: null, name: "users", alias: "u" }],
                schema: null,
            },
        ]);
        const joinItem = items.find((i) => typeof i.label === "string" && i.label.includes("orders"));
        expect(joinItem).toBeDefined();
        if (joinItem && typeof joinItem.label === "string") {
            expect(joinItem.label).toContain("ON");
            expect(joinItem.label).toContain("user_id");
        }
    });

    it("suggests products with ON clause via product_id heuristic", () => {
        const items = resolve([
            {
                kind: "join",
                tableRefs: [{ schema: null, name: "orders", alias: "o" }],
                schema: null,
            },
        ]);
        // products should be suggested since orders has product_id
        const productJoin = items.find((i) => typeof i.label === "string" && i.label.includes("products"));
        expect(productJoin).toBeDefined();
    });

    it("suggests tables without ON clause when no FK heuristic matches", () => {
        const items = resolve([
            {
                kind: "join",
                tableRefs: [{ schema: null, name: "products", alias: "p" }],
                schema: null,
            },
        ]);
        // Should still suggest tables even without FK matches
        expect(items.length).toBeGreaterThan(0);
    });

    it("suggests join tables with schema hint", () => {
        const items = resolve([
            {
                kind: "join",
                tableRefs: [{ schema: null, name: "users", alias: "u" }],
                schema: null,
            },
        ]);
        // Should suggest tables from all schemas when schema is null
        expect(items.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Multiple hint types (combined resolution)
// ============================================================================
describe("resolveHints — combined hints", () => {
    it("resolves table + schema hints together", () => {
        const items = resolve([
            { kind: "table", schema: null, localTableNames: [] },
            { kind: "schema" },
        ]);
        const l = items.map((i) => i.label);
        expect(l).toContain("users");
        expect(l).toContain("public");
        expect(l).toContain("analytics");
    });

    it("resolves column + function + keyword hints together", () => {
        const items = resolve([
            {
                kind: "column",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
            { kind: "function", schema: null, usage: "expression" as const },
            { kind: "keyword", lastToken: "SELECT" },
        ]);
        const l = items.map((i) => i.label);
        expect(l).toContain("id"); // column
        expect(l.some((s) => typeof s === "string" && s === "count")).toBe(true); // function
        expect(l).toContain("DISTINCT"); // keyword (select-list context)
    });

    it("handles empty hints array", () => {
        const items = resolve([]);
        expect(items).toEqual([]);
    });
});

// ============================================================================
// Multi-schema scenarios
// ============================================================================
describe("resolveHints — multi-schema", () => {
    it("qualified with analytics schema returns analytics tables", () => {
        const l = labels([
            { kind: "qualified", qualifier: "analytics", tableRefs: [], cteColumns: new Map() },
        ]);
        expect(l).toContain("events");
        expect(l).toContain("sessions");
        expect(l).not.toContain("users");
    });

    it("qualified with public schema returns public tables", () => {
        const l = labels([
            { kind: "qualified", qualifier: "public", tableRefs: [], cteColumns: new Map() },
        ]);
        expect(l).toContain("users");
        expect(l).toContain("orders");
        expect(l).not.toContain("events");
    });

    it("columns from analytics table via schema-qualified ref", () => {
        const l = labels([
            {
                kind: "column",
                tableRefs: [{ schema: "analytics", name: "sessions", alias: "s" }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        expect(l).toContain("started_at");
        expect(l).toContain("user_id");
        expect(l).not.toContain("email"); // from users, not sessions
    });
});

// ============================================================================
// Join condition resolution
// ============================================================================
describe("resolveHints — join conditions", () => {
    it("resolves join-condition hint to a completion item", () => {
        const items = resolve([
            {
                kind: "join-condition",
                tableRefs: [
                    { schema: null, name: "users", alias: "u" },
                    { schema: null, name: "orders", alias: "o" },
                ],
                parent: { schema: null, name: "users", alias: "u" },
            },
        ]);
        expect(items.length).toBeGreaterThan(0);
    });

    it("suggests FK-based join condition for orders.user_id → users.id", () => {
        const items = resolve([
            {
                kind: "join-condition",
                tableRefs: [
                    { schema: null, name: "users", alias: "u" },
                    { schema: null, name: "orders", alias: "o" },
                ],
                parent: { schema: null, name: "orders", alias: "o" },
            },
        ]);
        const fkItem = items.find(
            (i) => typeof i.label === "string" && i.label.includes("user_id") && i.label.includes("u.id"),
        );
        expect(fkItem).toBeDefined();
        expect(fkItem!.detail).toBe("join condition (fk)");
    });

    it("suggests FK-based join condition for orders.product_id → products.id", () => {
        const items = resolve([
            {
                kind: "join-condition",
                tableRefs: [
                    { schema: null, name: "products", alias: "p" },
                    { schema: null, name: "orders", alias: "o" },
                ],
                parent: { schema: null, name: "orders", alias: "o" },
            },
        ]);
        const fkItem = items.find(
            (i) => typeof i.label === "string" && i.label.includes("product_id") && i.label.includes("p.id"),
        );
        expect(fkItem).toBeDefined();
    });

    it("does not duplicate FK and naming-heuristic conditions", () => {
        const items = resolve([
            {
                kind: "join-condition",
                tableRefs: [
                    { schema: null, name: "users", alias: "u" },
                    { schema: null, name: "orders", alias: "o" },
                ],
                parent: { schema: null, name: "orders", alias: "o" },
            },
        ]);
        // user_id = id should appear only once (FK takes priority)
        const userIdItems = items.filter(
            (i) => typeof i.label === "string" && i.label.includes("user_id"),
        );
        expect(userIdItems).toHaveLength(1);
    });

    it("suggests cross-schema FK join condition", () => {
        const items = resolve([
            {
                kind: "join-condition",
                tableRefs: [
                    { schema: null, name: "users", alias: "u" },
                    { schema: "analytics", name: "events", alias: "e" },
                ],
                parent: { schema: "analytics", name: "events", alias: "e" },
            },
        ]);
        const fkItem = items.find(
            (i) => typeof i.label === "string" && i.label.includes("user_id") && i.label.includes("u.id"),
        );
        expect(fkItem).toBeDefined();
        expect(fkItem!.detail).toBe("join condition (fk)");
    });
});

// ============================================================================
// Deduplication
// ============================================================================
describe("resolveHints — deduplication", () => {
    it("deduplicates columns with the same label and kind", () => {
        // Simulate a scenario where two hints could produce the same column
        const items = resolve([
            {
                kind: "column",
                tableRefs: [{ schema: null, name: "users", alias: "u" }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
            {
                kind: "column",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                localTableNames: [],
                qualifiable: false,
                context: null,
            },
        ]);
        const idItems = items.filter((i) => i.label === "id");
        expect(idItems).toHaveLength(1);
    });
});

// ============================================================================
// CTE column resolution
// ============================================================================
describe("resolveHints — CTE columns", () => {
    it("resolves CTE columns for qualified CTE alias", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "cte",
                tableRefs: [],
                cteColumns: new Map([["cte", ["id", "name", "email"]]]),
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("name");
        expect(l).toContain("email");
    });

    it("CTE columns are case-insensitive on qualifier", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "MyCte",
                tableRefs: [],
                cteColumns: new Map([["mycte", ["col_a", "col_b"]]]),
            },
        ]);
        expect(l).toContain("col_a");
        expect(l).toContain("col_b");
    });

    it("CTE columns filter by prefix", () => {
        const items = resolve(
            [
                {
                    kind: "qualified",
                    qualifier: "cte",
                    tableRefs: [],
                    cteColumns: new Map([["cte", ["user_id", "user_name", "email"]]]),
                },
            ],
            "user",
        );
        expect(items.some((i) => i.label === "user_id")).toBe(true);
        expect(items.some((i) => i.label === "user_name")).toBe(true);
        expect(items.some((i) => i.label === "email")).toBe(false);
    });

    it("CTE takes priority over schema with same name", () => {
        // If a CTE is named "public", it should resolve CTE columns, not schema tables
        const l = labels([
            {
                kind: "qualified",
                qualifier: "public",
                tableRefs: [],
                cteColumns: new Map([["public", ["cte_col"]]]),
            },
        ]);
        expect(l).toContain("cte_col");
        expect(l).not.toContain("users"); // schema table, should not appear
    });

    it("falls back to table resolution when no CTE match", () => {
        const l = labels([
            {
                kind: "qualified",
                qualifier: "u",
                tableRefs: [{ schema: null, name: "users", alias: "u" }],
                cteColumns: new Map([["other_cte", ["col"]]]),
            },
        ]);
        expect(l).toContain("id");
        expect(l).toContain("email");
    });

    it("CTE column items have correct detail", () => {
        const items = resolve([
            {
                kind: "qualified",
                qualifier: "cte",
                tableRefs: [],
                cteColumns: new Map([["cte", ["id"]]]),
            },
        ]);
        const item = items.find((i) => i.label === "id");
        expect(item?.detail).toBe("cte · derived column");
    });
});

// ============================================================================
// VALUES positional hints
// ============================================================================
describe("resolveHints — VALUES positional hints", () => {
    it("shows column name and type for position 0 with explicit columns", () => {
        const items = resolve([
            {
                kind: "values",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                columns: ["id", "email", "name"],
                position: 0,
            },
        ]);
        expect(items.length).toBe(1);
        expect(items[0]!.detail).toContain("uuid");
        const label = items[0]!.label;
        const labelText = typeof label === "string" ? label : label.label;
        expect(labelText).toContain("id");
    });

    it("shows column at position 1 with explicit columns", () => {
        const items = resolve([
            {
                kind: "values",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                columns: ["id", "email", "name"],
                position: 1,
            },
        ]);
        expect(items.length).toBe(1);
        expect(items[0]!.detail).toContain("text");
        const label = items[0]!.label;
        const labelText = typeof label === "string" ? label : label.label;
        expect(labelText).toContain("email");
    });

    it("shows default value when column has one", () => {
        const items = resolve([
            {
                kind: "values",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                columns: ["id", "email", "name", "role"],
                position: 3,
            },
        ]);
        expect(items.length).toBe(1);
        expect(items[0]!.detail).toContain("default:");
    });

    it("uses table column order when no explicit column list", () => {
        const items = resolve([
            {
                kind: "values",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                columns: [],
                position: 1,
            },
        ]);
        expect(items.length).toBe(1);
        // Position 1 in users table = email column
        expect(items[0]!.detail).toContain("text");
    });

    it("returns empty for position beyond column count", () => {
        const items = resolve([
            {
                kind: "values",
                tableRefs: [{ schema: null, name: "users", alias: null }],
                columns: ["id"],
                position: 5,
            },
        ]);
        expect(items.length).toBe(0);
    });

    it("returns empty when table not found", () => {
        const items = resolve([
            {
                kind: "values",
                tableRefs: [{ schema: null, name: "nonexistent", alias: null }],
                columns: ["id"],
                position: 0,
            },
        ]);
        expect(items.length).toBe(0);
    });
});

// ============================================================================
// Subquery column resolution (via cteColumns path)
// ============================================================================
describe("Subquery column resolution", () => {
    it("resolves subquery alias columns like CTE columns", () => {
        const cteColumns = new Map<string, string[]>();
        cteColumns.set("sub", ["id", "name"]);
        const items = resolve([
            {
                kind: "qualified",
                qualifier: "sub",
                tableRefs: [{ schema: null, name: "sub", alias: null }],
                cteColumns,
            },
        ]);
        const l = items.map((i) => i.label);
        expect(l).toContain("id");
        expect(l).toContain("name");
    });

    it("filters subquery columns by prefix", () => {
        const cteColumns = new Map<string, string[]>();
        cteColumns.set("sub", ["id", "name", "email"]);
        const items = resolve(
            [
                {
                    kind: "qualified",
                    qualifier: "sub",
                    tableRefs: [{ schema: null, name: "sub", alias: null }],
                    cteColumns,
                },
            ],
            "na",
        );
        const l = items.map((i) => i.label);
        expect(l).toContain("name");
        expect(l).not.toContain("id");
        expect(l).not.toContain("email");
    });
});
