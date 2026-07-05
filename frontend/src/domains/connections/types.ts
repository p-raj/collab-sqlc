/** Connection domain types. */

import type { DatabaseType } from "./engine-registry";

export type { DatabaseType } from "./engine-registry";

export interface Connection {
  id: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  config: Record<string, unknown> | null;
  ssl_enabled: boolean;
  has_ssl_certificates: boolean;
  has_ssl_ca: boolean;
  has_ssl_client_certificates: boolean;
  ssh_enabled: boolean;
  ssh_host: string | null;
  ssh_port: number | null;
  ssh_username: string | null;
  is_shared: boolean;
  max_concurrent_queries: number;
  query_timeout_seconds: number;
  safe_mode: boolean;
  dbml_context: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionCreateRequest {
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  config?: Record<string, unknown> | null;
  credentials?: Record<string, unknown> | null;
  ssl_enabled?: boolean;
  ssl_ca?: string | null;
  ssl_cert?: string | null;
  ssl_key?: string | null;
  ssh_enabled?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_private_key?: string;
  max_concurrent_queries?: number;
  query_timeout_seconds?: number;
  safe_mode?: boolean;
  dbml_context?: Record<string, unknown> | null;
}

export interface ConnectionUpdateRequest {
  name?: string;
  db_type?: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  config?: Record<string, unknown> | null;
  credentials?: Record<string, unknown> | null;
  ssl_enabled?: boolean;
  ssl_ca?: string | null;
  ssl_cert?: string | null;
  ssl_key?: string | null;
  ssh_enabled?: boolean;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_private_key?: string;
  max_concurrent_queries?: number;
  query_timeout_seconds?: number;
  safe_mode?: boolean;
  dbml_context?: Record<string, unknown> | null;
}

export interface TestConnectionRequest {
  db_type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  config?: Record<string, unknown> | null;
  credentials?: Record<string, unknown> | null;
  ssl_enabled?: boolean;
  ssl_ca?: string | null;
  ssl_cert?: string | null;
  ssl_key?: string | null;
}
