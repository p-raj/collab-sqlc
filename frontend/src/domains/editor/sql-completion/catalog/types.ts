/**
 * Catalog — the bridge between schema data and the suggestion engine.
 *
 * Wraps TableInfo[] from the schema store and PG built-in data into
 * a uniform lookup interface that resolvers use to produce completions.
 */

import type { TableInfo } from "@/domains/schema/types";

export interface CatalogFunction {
    name: string;
    signature: string;
    description: string;
    category: string;
}

export interface Catalog {
    /** All tables from the active connection's schema. */
    tables: TableInfo[];

    /** All distinct schema names. */
    schemaNames: string[];

    /** Built-in functions. */
    functions: CatalogFunction[];

    /** Built-in data types. */
    datatypes: readonly string[];

    /** Keywords for a given context. */
    getKeywords(context: string | null): string[];

    /** Find a table by name, optionally qualified with schema. */
    findTable(name: string, schemaName?: string | null): TableInfo | undefined;

    /** Get tables within a specific schema. */
    getTablesInSchema(schemaName: string): TableInfo[];
}
