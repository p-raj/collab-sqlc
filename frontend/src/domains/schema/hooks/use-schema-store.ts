import { create } from "zustand";
import type {
  CatalogObject,
  CatalogObjectsResponse,
  ObjectDetailResponse,
  SchemaGroup,
  SchemaResponse,
  TableDetailResponse,
  TableInfo,
} from "../types";
import * as schemaApi from "../services/schema-api";

interface SchemaState {
  /** Raw schema data keyed by connection ID. */
  schemas: Record<string, SchemaResponse>;
  /** Rich table explorer payloads keyed by connection + schema + table. */
  tableDetails: Record<string, TableDetailResponse>;
  /** Engine-neutral catalog objects keyed by connection ID. */
  catalogObjects: Record<string, CatalogObjectsResponse>;
  /** Engine-neutral object details keyed by connection + object ID. */
  objectDetails: Record<string, ObjectDetailResponse>;
  /** Set of currently loading schema explorer connection IDs. */
  explorerLoadingIds: Set<string>;
  /** Set of currently loading connection IDs. */
  loadingIds: Set<string>;
  /** Set of currently loading catalog object connection IDs. */
  catalogLoadingIds: Set<string>;
  /** Set of currently loading table detail keys. */
  tableDetailLoadingIds: Set<string>;
  /** Set of currently loading object detail keys. */
  objectDetailLoadingIds: Set<string>;
  error: string | null;
  tableDetailErrors: Record<string, string>;
  objectDetailErrors: Record<string, string>;

  loadSchemaExplorer: (connectionId: string, refresh?: boolean) => Promise<void>;
  fetchSchema: (connectionId: string, refresh?: boolean) => Promise<void>;
  fetchCatalogObjects: (connectionId: string, refresh?: boolean) => Promise<void>;
  fetchObjectDetail: (
    connectionId: string,
    objectId: string,
    refresh?: boolean,
  ) => Promise<void>;
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
  getObjectForTable: (
    connectionId: string,
    schemaName: string,
    tableName: string,
  ) => CatalogObject | null;
  getObjectDetail: (connectionId: string, objectId: string) => ObjectDetailResponse | null;
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

export function getObjectDetailKey(connectionId: string, objectId: string): string {
  return `${connectionId}:${objectId}`;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schemas: {},
  tableDetails: {},
  catalogObjects: {},
  objectDetails: {},
  explorerLoadingIds: new Set<string>(),
  loadingIds: new Set<string>(),
  catalogLoadingIds: new Set<string>(),
  tableDetailLoadingIds: new Set<string>(),
  objectDetailLoadingIds: new Set<string>(),
  error: null,
  tableDetailErrors: {},
  objectDetailErrors: {},

  loadSchemaExplorer: async (connectionId, refresh = false) => {
    if (get().explorerLoadingIds.has(connectionId)) return;
    if (!refresh && get().schemas[connectionId] && get().catalogObjects[connectionId]) return;

    set((s) => ({
      explorerLoadingIds: new Set([...s.explorerLoadingIds, connectionId]),
    }));
    try {
      await get().fetchSchema(connectionId, refresh);
      if (refresh) {
        set((s) => {
          const { [connectionId]: _, ...catalogObjects } = s.catalogObjects;
          return { catalogObjects };
        });
      }
      await get().fetchCatalogObjects(connectionId, false);
    } finally {
      set((s) => {
        const next = new Set(s.explorerLoadingIds);
        next.delete(connectionId);
        return { explorerLoadingIds: next };
      });
    }
  },

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

  fetchCatalogObjects: async (connectionId, refresh = false) => {
    if (get().catalogLoadingIds.has(connectionId)) return;
    if (!refresh && get().catalogObjects[connectionId]) return;
    set((s) => ({
      catalogLoadingIds: new Set([...s.catalogLoadingIds, connectionId]),
      error: null,
    }));
    try {
      const catalog = await schemaApi.fetchCatalogObjects(connectionId, refresh);
      set((s) => {
        const next = new Set(s.catalogLoadingIds);
        next.delete(connectionId);
        return {
          catalogObjects: { ...s.catalogObjects, [connectionId]: catalog },
          catalogLoadingIds: next,
        };
      });
    } catch {
      set((s) => {
        const next = new Set(s.catalogLoadingIds);
        next.delete(connectionId);
        return { catalogLoadingIds: next, error: "Failed to load catalog objects" };
      });
    }
  },

  fetchObjectDetail: async (connectionId, objectId, refresh = false) => {
    const key = getObjectDetailKey(connectionId, objectId);
    if (get().objectDetailLoadingIds.has(key)) return;
    if (!refresh && get().objectDetails[key]) return;
    set((s) => ({
      objectDetailLoadingIds: new Set([...s.objectDetailLoadingIds, key]),
      objectDetailErrors: { ...s.objectDetailErrors, [key]: "" },
    }));
    try {
      const detail = await schemaApi.fetchObjectDetail(connectionId, objectId, refresh);
      set((s) => {
        const next = new Set(s.objectDetailLoadingIds);
        next.delete(key);
        return {
          objectDetails: { ...s.objectDetails, [key]: detail },
          objectDetailLoadingIds: next,
          objectDetailErrors: { ...s.objectDetailErrors, [key]: "" },
        };
      });
    } catch {
      set((s) => {
        const next = new Set(s.objectDetailLoadingIds);
        next.delete(key);
        return {
          objectDetailLoadingIds: next,
          objectDetailErrors: {
            ...s.objectDetailErrors,
            [key]: "Failed to load object details",
          },
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

  getObjectForTable: (connectionId, schemaName, tableName) => {
    return (
      get().catalogObjects[connectionId]?.objects.find(
        (object) => object.namespace === schemaName && object.name === tableName,
      ) ?? null
    );
  },

  getObjectDetail: (connectionId, objectId) =>
    get().objectDetails[getObjectDetailKey(connectionId, objectId)] ?? null,

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
      const { [connectionId]: __, ...catalogObjects } = s.catalogObjects;
      const tableDetails = Object.fromEntries(
        Object.entries(s.tableDetails).filter(([key]) => !key.startsWith(`${connectionId}:`)),
      );
      const objectDetails = Object.fromEntries(
        Object.entries(s.objectDetails).filter(([key]) => !key.startsWith(`${connectionId}:`)),
      );
      const tableDetailErrors = Object.fromEntries(
        Object.entries(s.tableDetailErrors).filter(([key]) => !key.startsWith(`${connectionId}:`)),
      );
      const objectDetailErrors = Object.fromEntries(
        Object.entries(s.objectDetailErrors).filter(
          ([key]) => !key.startsWith(`${connectionId}:`),
        ),
      );
      const tableDetailLoadingIds = new Set(
        [...s.tableDetailLoadingIds].filter((key) => !key.startsWith(`${connectionId}:`)),
      );
      const objectDetailLoadingIds = new Set(
        [...s.objectDetailLoadingIds].filter((key) => !key.startsWith(`${connectionId}:`)),
      );
      const explorerLoadingIds = new Set(
        [...s.explorerLoadingIds].filter((key) => key !== connectionId),
      );
      const catalogLoadingIds = new Set(
        [...s.catalogLoadingIds].filter((key) => key !== connectionId),
      );
      const loadingIds = new Set([...s.loadingIds].filter((key) => key !== connectionId));
      return {
        schemas: rest,
        catalogObjects,
        tableDetails,
        objectDetails,
        tableDetailErrors,
        objectDetailErrors,
        loadingIds,
        explorerLoadingIds,
        catalogLoadingIds,
        tableDetailLoadingIds,
        objectDetailLoadingIds,
      };
    });
  },

  clear: () =>
    set({
      schemas: {},
      tableDetails: {},
      catalogObjects: {},
      objectDetails: {},
      explorerLoadingIds: new Set<string>(),
      loadingIds: new Set<string>(),
      catalogLoadingIds: new Set<string>(),
      tableDetailLoadingIds: new Set<string>(),
      objectDetailLoadingIds: new Set<string>(),
      error: null,
      tableDetailErrors: {},
      objectDetailErrors: {},
    }),
}));
