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

export interface QueryRun {
  id: string;
  status: "queued" | "running" | "success" | "error" | "cancelled" | "timeout";
  backend_pid: number | null;
  backend_query_id: string | null;
  row_count: number | null;
  max_rows: number | null;
  execution_time_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  cancellation_requested_at: string | null;
}

interface SubmitRunResponse {
  run_id: string;
  status: QueryRun["status"];
}

export async function submitQueryRun(data: ExecuteRequest): Promise<SubmitRunResponse> {
  return api.post("queries/runs", { json: data }).json<SubmitRunResponse>();
}

export async function getQueryRun(runId: string): Promise<QueryRun> {
  return api.get(`queries/runs/${runId}`).json<QueryRun>();
}

export async function getQueryRunResult(runId: string): Promise<QueryResult> {
  return api.get(`queries/runs/${runId}/result`).json<QueryResult>();
}

export async function cancelQuery(runId: string): Promise<{ cancelled: boolean }> {
  return api.post(`queries/runs/${runId}/cancel`).json<{ cancelled: boolean }>();
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
