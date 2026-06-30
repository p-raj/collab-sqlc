/** History domain types. */

export interface RunHistoryEntry {
  id: string;
  user_id: string;
  user_display_name: string | null;
  user_email: string | null;
  connection_id: string;
  sql: string;
  status: "queued" | "running" | "success" | "error" | "cancelled" | "timeout";
  source: "editor" | "query_api";
  backend_pid: number | null;
  backend_query_id: string | null;
  timeout_seconds: number | null;
  max_rows: number | null;
  api_query_id: string | null;
  caller_ip: string | null;
  row_count: number | null;
  execution_time_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  cancellation_requested_at: string | null;
  created_at: string;
}

export interface RunHistoryListResponse {
  items: RunHistoryEntry[];
  total: number;
  has_more: boolean;
}
