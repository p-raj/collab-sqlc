export const DATABASE_ENGINE_IDS = ["postgresql", "clickhouse"] as const;

export type DatabaseType = (typeof DATABASE_ENGINE_IDS)[number];

export interface EngineCapabilities {
  explain: boolean;
  cancel: boolean;
  streaming: boolean;
}

export interface ExplainProfile {
  outputKind: "json" | "text";
  defaultTab: "tree" | "raw";
}

export interface DatabaseEngine {
  id: DatabaseType;
  label: string;
  shortLabel: string;
  defaultPort: number;
  dotColorClass: string;
  capabilities: EngineCapabilities;
  explain: ExplainProfile;
}

export const DATABASE_ENGINES: Record<DatabaseType, DatabaseEngine> = {
  postgresql: {
    id: "postgresql",
    label: "PostgreSQL",
    shortLabel: "PG",
    defaultPort: 5432,
    dotColorClass: "bg-green-500",
    capabilities: {
      explain: true,
      cancel: true,
      streaming: true,
    },
    explain: {
      outputKind: "json",
      defaultTab: "tree",
    },
  },
  clickhouse: {
    id: "clickhouse",
    label: "ClickHouse",
    shortLabel: "CH",
    defaultPort: 8123,
    dotColorClass: "bg-orange-500",
    capabilities: {
      explain: true,
      cancel: false,
      streaming: false,
    },
    explain: {
      outputKind: "text",
      defaultTab: "raw",
    },
  },
};

export function getDatabaseEngine(
  dbType: DatabaseType | null | undefined,
): DatabaseEngine {
  return DATABASE_ENGINES[dbType ?? "postgresql"] ?? DATABASE_ENGINES.postgresql;
}
