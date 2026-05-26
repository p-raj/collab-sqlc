/**
 * Create a Catalog instance from schema data and a dialect profile.
 */

import type { TableInfo } from "@/domains/schema/types";
import type { Catalog } from "./types";
import type { DialectProfile } from "./dialect";
import { getDialect } from "./dialect";
import type { DatabaseType } from "./dialect";

const DEFAULT_SCHEMA_NAME = "public";

export function createCatalog(tables: TableInfo[], dbType?: DatabaseType | null): Catalog {
    const dialect: DialectProfile = getDialect(dbType);
    const schemaNames = [...new Set(tables.map((t) => t.schema_name))].sort();

    return {
        tables,
        schemaNames,
        functions: dialect.functions,
        datatypes: dialect.datatypes,
        getKeywords: dialect.getKeywords,

        findTable(name: string, schemaName?: string | null): TableInfo | undefined {
            const normalized = name.toLowerCase();

            // schema-qualified lookup
            if (schemaName) {
                const ns = schemaName.toLowerCase();
                return tables.find(
                    (t) => t.table_name.toLowerCase() === normalized && t.schema_name.toLowerCase() === ns,
                );
            }

            // Check if name itself is schema-qualified (schema.table)
            const dotIdx = normalized.indexOf(".");
            if (dotIdx > 0) {
                const schema = normalized.slice(0, dotIdx);
                const table = normalized.slice(dotIdx + 1);
                return tables.find(
                    (t) => t.table_name.toLowerCase() === table && t.schema_name.toLowerCase() === schema,
                );
            }

            const matches = tables.filter((t) => t.table_name.toLowerCase() === normalized);
            if (matches.length === 0) return undefined;

            const defaultSchemaMatch = matches.find(
                (t) => t.schema_name.toLowerCase() === DEFAULT_SCHEMA_NAME,
            );
            if (defaultSchemaMatch) return defaultSchemaMatch;

            return matches.length === 1 ? matches[0] : undefined;
        },

        getTablesInSchema(schemaName: string): TableInfo[] {
            const ns = schemaName.toLowerCase();
            return tables.filter((t) => t.schema_name.toLowerCase() === ns);
        },
    };
}
