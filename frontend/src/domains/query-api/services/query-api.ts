import { api } from "@/shared/services/api-client";
import type {
  APIQueryDetails,
  ExecutionLogDetail,
  APIQueryListItem,
  EnableAPIRequest,
  EnableAPIResponse,
  ExecutionLogEntry,
  RotateKeyResponse,
  TestExecuteRequest,
  UpdateAPIConfigRequest,
} from "../types";

const PREFIX = "query-api";

export async function fetchAPIQueries(): Promise<APIQueryListItem[]> {
  return api.get(PREFIX).json<APIQueryListItem[]>();
}

export async function fetchAPIQueryDetails(queryId: string): Promise<APIQueryDetails> {
  return api.get(`${PREFIX}/${queryId}`).json<APIQueryDetails>();
}

export async function enableAPI(
  queryId: string,
  config?: EnableAPIRequest,
): Promise<EnableAPIResponse> {
  return api.post(`${PREFIX}/${queryId}/enable`, { json: config ?? {} }).json<EnableAPIResponse>();
}

export async function disableAPI(queryId: string): Promise<{ message: string }> {
  return api.post(`${PREFIX}/${queryId}/disable`).json<{ message: string }>();
}

export async function updateAPIConfig(
  queryId: string,
  config: UpdateAPIConfigRequest,
): Promise<{ message: string }> {
  return api.put(`${PREFIX}/${queryId}/config`, { json: config }).json<{ message: string }>();
}

export async function rotateAPIKey(queryId: string): Promise<RotateKeyResponse> {
  return api.post(`${PREFIX}/${queryId}/rotate`).json<RotateKeyResponse>();
}

export async function republishAPI(queryId: string): Promise<{ message: string }> {
  return api.post(`${PREFIX}/${queryId}/republish`).json<{ message: string }>();
}

export async function testExecuteAPI(
  queryId: string,
  body: TestExecuteRequest,
): Promise<{ columns: string[]; rows: unknown[][]; row_count: number; execution_time_ms: number }> {
  return api.post(`${PREFIX}/${queryId}/test`, { json: body }).json();
}

export async function fetchExecutionLogs(
  queryId?: string,
  params?: { limit?: number; offset?: number },
): Promise<ExecutionLogEntry[]> {
  const searchParams = { ...params };
  if (queryId) {
    return api.get(`${PREFIX}/${queryId}/logs`, { searchParams }).json<ExecutionLogEntry[]>();
  }
  return api.get(`${PREFIX}/logs`, { searchParams }).json<ExecutionLogEntry[]>();
}

export async function fetchExecutionLogDetail(executionId: string): Promise<ExecutionLogDetail> {
  return api.get(`${PREFIX}/logs/${executionId}`).json<ExecutionLogDetail>();
}
