import { api } from "@/shared/services/api-client";
import type { QueryResult } from "../types";

interface ExecuteRequest {
  connection_id: string;
  sql: string;
  params?: Record<string, unknown>;
  write_mode?: boolean;
  query_id?: string;
}

export async function executeQuery(data: ExecuteRequest): Promise<QueryResult> {
  return api.post("queries/execute", { json: data }).json<QueryResult>();
}

export async function cancelQuery(queryId: string): Promise<{ cancelled: boolean }> {
  return api.post("queries/cancel", { json: { query_id: queryId } }).json<{ cancelled: boolean }>();
}

export interface RunningQueryInfo {
  running: boolean;
  pid: number | null;
}

export async function getRunningQuery(queryId: string): Promise<RunningQueryInfo> {
  return api.get(`queries/running/${queryId}`).json<RunningQueryInfo>();
}

export async function exportQueryCsv(connectionId: string, sql: string): Promise<Blob> {
  return api
    .post("queries/export", {
      json: { connection_id: connectionId, sql, format: "csv" },
    })
    .blob();
}

export async function exportQueryJson(connectionId: string, sql: string): Promise<Blob> {
  return api
    .post("queries/export", {
      json: { connection_id: connectionId, sql, format: "json" },
    })
    .blob();
}

interface FormatSqlResponse {
  sql: string;
}

export async function formatSql(sql: string, dialect?: string): Promise<string> {
  const res = await api
    .post("queries/format", { json: { sql, dialect: dialect ?? null } })
    .json<FormatSqlResponse>();
  return res.sql;
}

interface ExplainRequest {
  connection_id: string;
  sql: string;
  params?: Record<string, unknown>;
  query_id?: string;
}

interface ExplainResponse {
  plan: string;
  query: string;
}

export async function explainQuery(data: ExplainRequest): Promise<ExplainResponse> {
  return api.post("queries/explain", { json: data }).json<ExplainResponse>();
}
