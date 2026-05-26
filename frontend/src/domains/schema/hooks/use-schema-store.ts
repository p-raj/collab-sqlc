import { create } from "zustand";
import type { SchemaGroup, SchemaResponse, TableDetailResponse, TableInfo } from "../types";
import * as schemaApi from "../services/schema-api";

interface SchemaState {
  /** Raw schema data keyed by connection ID. */
  schemas: Record<string, SchemaResponse>;
  /** Rich table explorer payloads keyed by connection + schema + table. */
  tableDetails: Record<string, TableDetailResponse>;
  /** Set of currently loading connection IDs. */
  loadingIds: Set<string>;
  /** Set of currently loading table detail keys. */
  tableDetailLoadingIds: Set<string>;
  error: string | null;
  tableDetailErrors: Record<string, string>;

  fetchSchema: (connectionId: string, refresh?: boolean) => Promise<void>;
  fetchTableDetail: (
    connectionId: string,
    schemaName: string,
    tableName: string,
    refresh?: boolean,
  ) => Promise<void>;
  getGroups: (connectionId: string) => SchemaGroup[];
  getTables: (connectionId: string) => TableInfo[];
  getTableDetail: (
    connectionId: string,
    schemaName: string,
    tableName: string,
  ) => TableDetailResponse | null;
  getTableDetailError: (
    connectionId: string,
    schemaName: string,
    tableName: string,
  ) => string | null;
  isTableDetailLoading: (connectionId: string, schemaName: string, tableName: string) => boolean;
  /** Remove cached schema for a single connection (e.g. after connection settings change). */
  clearForConnection: (connectionId: string) => void;
  clear: () => void;
}

function groupBySchema(tables: TableInfo[]): SchemaGroup[] {
  const map = new Map<string, TableInfo[]>();
  for (const table of tables) {
    const existing = map.get(table.schema_name);
    if (existing) {
      existing.push(table);
    } else {
      map.set(table.schema_name, [table]);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, tables]) => ({
      name,
      tables: tables.sort((a, b) => a.table_name.localeCompare(b.table_name)),
    }));
}

function getTableDetailKey(connectionId: string, schemaName: string, tableName: string): string {
  return `${connectionId}:${schemaName}:${tableName}`;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schemas: {},
  tableDetails: {},
  loadingIds: new Set<string>(),
  tableDetailLoadingIds: new Set<string>(),
  error: null,
  tableDetailErrors: {},

  fetchSchema: async (connectionId, refresh = false) => {
    if (get().loadingIds.has(connectionId)) return;

    // Skip fetch if already cached and not refreshing
    if (!refresh && get().schemas[connectionId]) return;

    set((s) => ({ loadingIds: new Set([...s.loadingIds, connectionId]), error: null }));
    try {
      const schema = await schemaApi.fetchSchema(connectionId, refresh);
      set((s) => {
        const next = new Set(s.loadingIds);
        next.delete(connectionId);
        return {
          schemas: { ...s.schemas, [connectionId]: schema },
          loadingIds: next,
        };
      });
    } catch {
      set((s) => {
        const next = new Set(s.loadingIds);
        next.delete(connectionId);
        return { loadingIds: next, error: "Failed to load schema" };
      });
    }
  },

  fetchTableDetail: async (connectionId, schemaName, tableName, refresh = false) => {
    const key = getTableDetailKey(connectionId, schemaName, tableName);
    if (get().tableDetailLoadingIds.has(key)) return;
    if (!refresh && get().tableDetails[key]) return;

    set((s) => ({
      tableDetailLoadingIds: new Set([...s.tableDetailLoadingIds, key]),
      tableDetailErrors: { ...s.tableDetailErrors, [key]: "" },
    }));
    try {
      const detail = await schemaApi.fetchTableDetail(connectionId, schemaName, tableName, refresh);
      set((s) => {
        const next = new Set(s.tableDetailLoadingIds);
        next.delete(key);
        return {
          tableDetails: { ...s.tableDetails, [key]: detail },
          tableDetailLoadingIds: next,
          tableDetailErrors: { ...s.tableDetailErrors, [key]: "" },
        };
      });
    } catch {
      set((s) => {
        const next = new Set(s.tableDetailLoadingIds);
        next.delete(key);
        return {
          tableDetailLoadingIds: next,
          tableDetailErrors: { ...s.tableDetailErrors, [key]: "Failed to load table details" },
        };
      });
    }
  },

  getGroups: (connectionId) => {
    const schema = get().schemas[connectionId];
    if (!schema) return [];
    return groupBySchema(schema.tables);
  },

  getTables: (connectionId) => {
    const schema = get().schemas[connectionId];
    return schema?.tables ?? [];
  },

  getTableDetail: (connectionId, schemaName, tableName) => {
    const key = getTableDetailKey(connectionId, schemaName, tableName);
    return get().tableDetails[key] ?? null;
  },

  getTableDetailError: (connectionId, schemaName, tableName) => {
    const key = getTableDetailKey(connectionId, schemaName, tableName);
    return get().tableDetailErrors[key] || null;
  },

  isTableDetailLoading: (connectionId, schemaName, tableName) => {
    const key = getTableDetailKey(connectionId, schemaName, tableName);
    return get().tableDetailLoadingIds.has(key);
  },

  /** Remove cached schema for a single connection (e.g. after connection settings change). */
  clearForConnection: (connectionId: string) => {
    set((s) => {
      const { [connectionId]: _, ...rest } = s.schemas;
      const tableDetails = Object.fromEntries(
        Object.entries(s.tableDetails).filter(([key]) => !key.startsWith(`${connectionId}:`)),
      );
      const tableDetailErrors = Object.fromEntries(
        Object.entries(s.tableDetailErrors).filter(([key]) => !key.startsWith(`${connectionId}:`)),
      );
      const tableDetailLoadingIds = new Set(
        [...s.tableDetailLoadingIds].filter((key) => !key.startsWith(`${connectionId}:`)),
      );
      return { schemas: rest, tableDetails, tableDetailErrors, tableDetailLoadingIds };
    });
  },

  clear: () =>
    set({
      schemas: {},
      tableDetails: {},
      loadingIds: new Set<string>(),
      tableDetailLoadingIds: new Set<string>(),
      error: null,
      tableDetailErrors: {},
    }),
}));
