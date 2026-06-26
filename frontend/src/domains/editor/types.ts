/** Editor domain types. */

import type { TableExplorerTabId } from "@/domains/schema/types";
import type { DatabaseType } from "@/domains/connections/engine-registry";

export interface SchemaViewData {
  schemaName: string;
  tableName: string;
  activeSection: TableExplorerTabId;
}

export interface Tab {
  id: string;
  title: string;
  sql: string;
  /** Exact SQL most recently sent to the backend for a successful run. */
  executedSql: string | null;
  /** SQL content at last save point — used to detect dirty state. */
  savedSql: string;
  /** Links this tab to a persisted saved query for quick-save overwrite. */
  savedQueryId: string | null;
  /** Folder name for display path (e.g. "folder / query"). Null for unsaved tabs. */
  folderName: string | null;
  connectionId: string | null;
  result: QueryResult | null;
  error: string | null;
  /** 1-based character offset into `sql` where the DB error occurred. */
  errorPosition: number | null;
  /** True while this tab owns an in-flight query or EXPLAIN request. */
  isExecuting: boolean;
  /** Backend query id for the in-flight request owned by this tab. */
  runningQueryId: string | null;
  /** PostgreSQL backend PID for the in-flight request, when available. */
  backendPid: number | null;
  /** Database type captured when the in-flight request started. */
  runningDbType: DatabaseType | null;
  schemaView: SchemaViewData | null;
  variables: Record<string, string>;
  /** When true, allows INSERT/UPDATE/DELETE/DDL queries. Defaults to false (read-only). */
  writeMode: boolean;
  /** Whether this saved query is hosted as an API. */
  apiEnabled: boolean;
  /** Raw JSON plan from EXPLAIN ANALYZE. */
  explainPlan: string | null;
  /** Original SQL that was explained. */
  explainQuery: string | null;
  /** Database type that produced the EXPLAIN output. */
  explainDbType: DatabaseType | null;
}

export interface QueryResult {
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
}

export interface ExplainResult {
  plan: string;
  query: string;
}

export type EditorAction =
  | { type: "ADD_TAB"; tab: Tab }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "SET_ACTIVE_TAB"; tabId: string }
  | { type: "UPDATE_SQL"; tabId: string; sql: string }
  | { type: "SET_CONNECTION"; tabId: string; connectionId: string }
  | { type: "RENAME_TAB"; tabId: string; title: string }
  | {
      type: "START_EXECUTION";
      tabId: string;
      queryId: string;
      dbType: DatabaseType | null;
    }
  | { type: "SET_BACKEND_PID"; tabId: string; queryId: string; pid: number }
  | {
      type: "SET_RESULT";
      tabId: string;
      result: QueryResult | null;
      sql: string;
      queryId?: string;
    }
  | {
      type: "SET_ERROR";
      tabId: string;
      error: string | null;
      position?: number | null;
      queryId?: string;
    }
  | {
      type: "SET_EXPLAIN_RESULT";
      tabId: string;
      plan: string;
      query: string;
      dbType: DatabaseType | null;
      queryId?: string;
    }
  | { type: "SET_VARIABLE"; tabId: string; name: string; value: string }
  | { type: "MARK_SAVED"; tabId: string }
  | { type: "LINK_SAVED_QUERY"; tabId: string; savedQueryId: string; folderName?: string | null }
  | { type: "DUPLICATE_TAB"; sourceTabId: string }
  | { type: "CLOSE_OTHER_TABS"; keepTabId: string }
  | { type: "TOGGLE_WRITE_MODE"; tabId: string }
  | { type: "SET_API_ENABLED"; tabId: string; enabled: boolean }
  | { type: "SET_SCHEMA_SECTION"; tabId: string; section: TableExplorerTabId };

export interface EditorState {
  tabs: Tab[];
  activeTabId: string;
}
