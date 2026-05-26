/** History domain types. */

export interface RunHistoryEntry {
  id: string;
  user_id: string;
  user_display_name: string | null;
  user_email: string | null;
  connection_id: string;
  sql: string;
  status: "success" | "error";
  row_count: number | null;
  execution_time_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface RunHistoryListResponse {
  items: RunHistoryEntry[];
  total: number;
  has_more: boolean;
}
