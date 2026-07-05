/**
 * DialectProfile — engine-specific catalog data for autocomplete.
 *
 * Each supported database engine provides its own keywords, functions,
 * and data types. The completion system works against the Catalog interface
 * (engine-agnostic); the DialectProfile feeds engine-specific data into it.
 */

export type { DatabaseType } from "@/domains/connections/engine-registry";
import type { CatalogFunction } from "./types";
import type { DatabaseType } from "@/domains/connections/engine-registry";
import { PG_FUNCTIONS } from "./pg/functions";
import { PG_DATATYPES } from "./pg/datatypes";
import { getKeywordsForContext as pgKeywords } from "./pg/keywords";
import { CH_FUNCTIONS } from "./ch/functions";
import { CH_DATATYPES } from "./ch/datatypes";
import { getKeywordsForContext as chKeywords } from "./ch/keywords";

export interface DialectProfile {
    readonly id: SqlDatabaseType;
    readonly functions: CatalogFunction[];
    readonly datatypes: readonly string[];
    readonly getKeywords: (context: string | null) => string[];
}

type SqlDatabaseType = Extract<DatabaseType, "postgresql" | "clickhouse">;

const PG_DIALECT: DialectProfile = {
    id: "postgresql",
    functions: PG_FUNCTIONS,
    datatypes: PG_DATATYPES,
    getKeywords: pgKeywords,
};

const CH_DIALECT: DialectProfile = {
    id: "clickhouse",
    functions: CH_FUNCTIONS,
    datatypes: CH_DATATYPES,
    getKeywords: chKeywords,
};

const DIALECTS: Record<SqlDatabaseType, DialectProfile> = {
    postgresql: PG_DIALECT,
    clickhouse: CH_DIALECT,
};

export function getDialect(dbType: DatabaseType | null | undefined): DialectProfile {
    if (dbType === "clickhouse") {
        return DIALECTS.clickhouse;
    }
    return PG_DIALECT;
}
