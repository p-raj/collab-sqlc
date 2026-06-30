import { api } from "@/shared/services/api-client";
import type { RunHistoryListResponse } from "../types";

export async function fetchRunHistory(
  connectionId?: string,
  limit = 50,
  offset = 0,
): Promise<RunHistoryListResponse> {
  const searchParams: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (connectionId) searchParams["connection_id"] = connectionId;
  return api.get("history", { searchParams }).json<RunHistoryListResponse>();
}

export async function clearRunHistory(): Promise<void> {
  await api.delete("history");
}

export async function cancelRun(runId: string): Promise<{ cancelled: boolean }> {
  return api.post(`queries/runs/${runId}/cancel`).json<{ cancelled: boolean }>();
}
