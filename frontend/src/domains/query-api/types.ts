export interface ParameterDef {
  name: string;
  type: "string" | "integer" | "float" | "number" | "boolean" | "uuid" | "any";
  required: boolean;
  default?: string | number | boolean | null;
}

export interface APIQueryListItem {
  id: string;
  title: string;
  sql_preview: string;
  api_enabled: boolean;
  api_key_prefix: string | null;
  api_parameters: ParameterDef[] | null;
  api_row_limit: number | null;
  api_rate_limit: number | null;
  api_notes: string | null;
  is_shared: boolean;
  has_sql_drift: boolean;
  created_by: string;
  updated_at: string;
}

export interface APIQueryDetails {
  id: string;
  title: string;
  connection_id: string | null;
  api_enabled: boolean;
  api_key_prefix: string | null;
  api_parameters: ParameterDef[] | null;
  api_row_limit: number | null;
  api_timeout_seconds: number | null;
  api_rate_limit: number | null;
  api_allowed_ips: string[] | null;
  api_notes: string | null;
  is_shared: boolean;
  has_sql_drift: boolean;
}

export interface EnableAPIRequest {
  parameters?: ParameterDef[] | null;
  row_limit?: number | null;
  timeout_seconds?: number | null;
  rate_limit?: number | null;
  allowed_ips?: string[] | null;
  notes?: string | null;
}

export interface EnableAPIResponse {
  api_key: string;
  api_key_prefix: string;
  message: string;
}

export interface RotateKeyResponse {
  api_key: string;
  api_key_prefix: string;
  message: string;
}

export interface UpdateAPIConfigRequest {
  parameters?: ParameterDef[] | null;
  row_limit?: number | null;
  timeout_seconds?: number | null;
  rate_limit?: number | null;
  allowed_ips?: string[] | null;
  notes?: string | null;
}

export interface TestExecuteRequest {
  connection_id: string;
  params: Record<string, unknown>;
}

export interface ExecuteAPIResponse {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
}

export interface ExecutionLogResponseData {
  columns: string[];
  column_types?: string[];
  rows: unknown[][];
  row_count: number;
}

export interface ExecutionLogEntry {
  id: string;
  query_id: string;
  query_title?: string | null;
  connection_id: string;
  connection_name?: string | null;
  caller_ip: string;
  status_code: number;
  execution_time_ms: number | null;
  params_sent?: Record<string, unknown> | null;
  response_preview?: { row_count?: number; columns?: string[] } | null;
  error?: string | null;
  created_at: string;
}

export interface ExecutionLogDetail {
  id: string;
  query_id: string;
  query_title?: string | null;
  query_sql: string;
  connection_id: string;
  connection_name?: string | null;
  caller_ip: string;
  status_code: number;
  execution_time_ms: number | null;
  params_sent?: Record<string, unknown> | null;
  response_data?: ExecutionLogResponseData | null;
  error?: string | null;
  created_at: string;
}
