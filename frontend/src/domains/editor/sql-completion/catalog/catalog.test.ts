import { describe, expect, it } from "vitest";
import { createCatalog } from "./catalog";
import { getDialect } from "./dialect";
import { PG_FUNCTIONS } from "./pg/functions";
import { PG_DATATYPES } from "./pg/datatypes";
import type { TableInfo } from "@/domains/schema/types";

const TABLES: TableInfo[] = [
    {
        schema_name: "public",
        table_name: "users",
        columns: [{ name: "id", data_type: "uuid", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null }],
        row_count: null,
        comment: null,
    },
    {
        schema_name: "analytics",
        table_name: "users",
        columns: [{ name: "event_id", data_type: "uuid", is_nullable: false, is_primary_key: false, default_value: null, comment: null, foreign_key: null }],
        row_count: null,
        comment: null,
    },
    {
        schema_name: "analytics",
        table_name: "events",
        columns: [{ name: "id", data_type: "uuid", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null }],
        row_count: null,
        comment: null,
    },
    {
        schema_name: "audit",
        table_name: "events",
        columns: [{ name: "id", data_type: "uuid", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null }],
        row_count: null,
        comment: null,
    },
    {
        schema_name: "audit",
        table_name: "logs",
        columns: [{ name: "id", data_type: "uuid", is_nullable: false, is_primary_key: true, default_value: null, comment: null, foreign_key: null }],
        row_count: null,
        comment: null,
    },
];

describe("createCatalog", () => {
    it("prefers the public schema for unqualified table names", () => {
        const catalog = createCatalog(TABLES);
        const table = catalog.findTable("users");

        expect(table?.schema_name).toBe("public");
    });

    it("returns the exact schema-qualified table", () => {
        const catalog = createCatalog(TABLES);
        const table = catalog.findTable("users", "analytics");

        expect(table?.schema_name).toBe("analytics");
    });

    it("returns undefined for ambiguous non-default schema matches", () => {
        const catalog = createCatalog(TABLES);

        expect(catalog.findTable("events")).toBeUndefined();
    });

    it("returns the single matching table when unqualified lookup is unambiguous", () => {
        const catalog = createCatalog(TABLES);
        const table = catalog.findTable("logs");

        expect(table?.schema_name).toBe("audit");
        expect(table?.table_name).toBe("logs");
    });
});

describe("dialect dispatch", () => {
    it("defaults to PostgreSQL functions and datatypes", () => {
        const catalog = createCatalog(TABLES);
        expect(catalog.functions).toBe(PG_FUNCTIONS);
        expect(catalog.datatypes).toBe(PG_DATATYPES);
    });

    it("uses PostgreSQL dialect when db_type is postgresql", () => {
        const catalog = createCatalog(TABLES, "postgresql");
        expect(catalog.functions).toBe(PG_FUNCTIONS);
        expect(catalog.datatypes).toBe(PG_DATATYPES);
    });

    it("uses ClickHouse dialect with CH-specific data when db_type is clickhouse", () => {
        const catalog = createCatalog(TABLES, "clickhouse");
        expect(catalog.functions.length).toBeGreaterThan(0);
        expect(catalog.functions[0]!.category).toBeDefined();
        expect(catalog.datatypes.length).toBeGreaterThan(0);
        expect(catalog.datatypes).toContain("UInt64");
    });

    it("getDialect returns PG for null/undefined", () => {
        expect(getDialect(null).id).toBe("postgresql");
        expect(getDialect(undefined).id).toBe("postgresql");
    });

    it("getDialect returns correct dialect by name", () => {
        expect(getDialect("postgresql").id).toBe("postgresql");
        expect(getDialect("clickhouse").id).toBe("clickhouse");
    });
});