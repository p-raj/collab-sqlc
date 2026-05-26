import { api } from "@/shared/services/api-client";
import type { SchemaResponse, TableDetailResponse } from "../types";

export async function fetchSchema(connectionId: string, refresh = false): Promise<SchemaResponse> {
  const searchParams = refresh ? { refresh: "true" } : undefined;
  return api.get(`schema/${connectionId}`, { searchParams }).json<SchemaResponse>();
}

export async function invalidateSchemaCache(connectionId: string): Promise<void> {
  await api.delete(`schema/${connectionId}/cache`);
}

export async function fetchTableDetail(
  connectionId: string,
  schemaName: string,
  tableName: string,
  refresh = false,
): Promise<TableDetailResponse> {
  const searchParams = refresh ? { refresh: "true" } : undefined;
  return api
    .get(
      `schema/${connectionId}/tables/${encodeURIComponent(schemaName)}/${encodeURIComponent(tableName)}`,
      { searchParams },
    )
    .json<TableDetailResponse>();
}
