export const DATABASE_ENGINE_IDS = ["postgresql", "clickhouse", "redis", "dynamodb"] as const;

export type DatabaseType = (typeof DATABASE_ENGINE_IDS)[number];

export interface EngineCapabilities {
  explain: boolean;
  cancel: boolean;
  streaming: boolean;
  catalog: boolean;
  writeGuard: boolean;
  format: boolean;
  export: boolean;
  resultShapes: ResultShape[];
  languages: OperationLanguage[];
}

export type EngineKind = "sql" | "redis" | "dynamodb";
export type ResultShape = "tabular" | "document" | "scalar" | "list" | "key_value";
export type OperationLanguage = "sql" | "redis-command" | "partiql";

export interface ExplainProfile {
  outputKind: "json" | "text";
  defaultTab: "tree" | "raw";
}

export interface DatabaseEngine {
  id: DatabaseType;
  label: string;
  engineKind: EngineKind;
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
    engineKind: "sql",
    shortLabel: "PG",
    defaultPort: 5432,
    dotColorClass: "bg-green-500",
    capabilities: {
      explain: true,
      cancel: true,
      streaming: true,
      catalog: true,
      writeGuard: true,
      format: true,
      export: true,
      resultShapes: ["tabular"],
      languages: ["sql"],
    },
    explain: {
      outputKind: "json",
      defaultTab: "tree",
    },
  },
  clickhouse: {
    id: "clickhouse",
    label: "ClickHouse",
    engineKind: "sql",
    shortLabel: "CH",
    defaultPort: 8123,
    dotColorClass: "bg-orange-500",
    capabilities: {
      explain: true,
      cancel: false,
      streaming: false,
      catalog: true,
      writeGuard: true,
      format: true,
      export: true,
      resultShapes: ["tabular"],
      languages: ["sql"],
    },
    explain: {
      outputKind: "text",
      defaultTab: "raw",
    },
  },
  redis: {
    id: "redis",
    label: "Redis",
    engineKind: "redis",
    shortLabel: "RDS",
    defaultPort: 6379,
    dotColorClass: "bg-red-500",
    capabilities: {
      explain: false,
      cancel: false,
      streaming: false,
      catalog: true,
      writeGuard: true,
      format: false,
      export: true,
      resultShapes: ["scalar", "list", "key_value"],
      languages: ["redis-command"],
    },
    explain: {
      outputKind: "text",
      defaultTab: "raw",
    },
  },
  dynamodb: {
    id: "dynamodb",
    label: "DynamoDB",
    engineKind: "dynamodb",
    shortLabel: "DDB",
    defaultPort: 443,
    dotColorClass: "bg-blue-500",
    capabilities: {
      explain: false,
      cancel: false,
      streaming: false,
      catalog: true,
      writeGuard: true,
      format: false,
      export: true,
      resultShapes: ["document", "tabular"],
      languages: ["partiql"],
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
