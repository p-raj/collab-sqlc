import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  getQueryRun,
  getQueryRunResult,
  submitQueryRun,
  explainQuery,
  cancelQuery,
  exportQueryCsv,
  exportQueryJson,
  formatSql,
} from "../services/query-api";
import {
  resultsToCsv,
  resultsToJson,
  copyToClipboard,
  downloadFile,
  downloadBlob,
} from "../services/export-utils";
import { editorReducer, createTab, createSchemaTab } from "./editor-reducer";
import { useTabPersistence, getInitialEditorState } from "./use-tab-persistence";
import type { EditorState, EditorAction, Tab } from "../types";
import {
  getSelectedConnectionDbType,
  resolveConnectionOverride,
} from "../utils/selected-connection";
import { useConnectionsStore } from "@/domains/connections/hooks/use-connections-store";
import { HTTPError } from "ky";
import { extractSmartVariables, substituteSmartVariables } from "../utils/smart-variables";
import { fetchObjectDetail } from "@/domains/schema/services/schema-api";
export { extractSmartVariables } from "../utils/smart-variables";

interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  activeTab: Tab | undefined;
  handleCloseTab: (tabId: string) => Promise<void>;
  handleExecute: (sqlOverride?: string) => Promise<void>;
  handleExplain: (sqlOverride?: string) => Promise<void>;
  handleCancel: () => Promise<void>;
  handleExportAll: (format: "csv" | "json") => Promise<void>;
  isExporting: boolean;
  handleCopyCsv: () => void;
  handleCopyJson: () => void;
  handleExportCsv: () => void;
  handleReplayQuery: (sql: string, connectionIdOverride?: string | null) => void;
  handleOpenSchemaTab: (
    schemaName: string,
    tableName: string,
    objectId?: string,
    connectionIdOverride?: string | null,
  ) => void;
  handleGenerateSelect: (
    schemaName: string,
    tableName: string,
    objectId?: string,
    connectionIdOverride?: string | null,
  ) => Promise<void>;
  handleFormatSql: () => Promise<void>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

const RUN_POLL_INTERVAL_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteRedisArgument(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function fallbackPreviewText(
  dbType: string | null,
  schemaName: string,
  tableName: string,
): string {
  if (dbType === "dynamodb") {
    return `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100;`;
  }
  if (dbType === "redis") {
    return `TYPE ${quoteRedisArgument(tableName)}`;
  }
  return `SELECT * FROM ${schemaName}.${tableName} LIMIT 100;`;
}

function getCloseTabMessage(tab: Tab): string | null {
  const isDirty = tab.sql !== tab.savedSql;
  if (tab.isExecuting && isDirty) {
    return `"${tab.title}" has unsaved changes and is running a query. Cancel the query and close anyway?`;
  }
  if (tab.isExecuting) {
    return `"${tab.title}" is running a query. Cancel the query and close the tab?`;
  }
  if (isDirty) {
    return `"${tab.title}" has unsaved changes. Close anyway?`;
  }
  return null;
}

export function EditorProvider({
  children,
  activeConnectionId,
}: {
  children: ReactNode;
  activeConnectionId: string | null;
}) {
  const [state, dispatch] = useReducer(editorReducer, undefined, getInitialEditorState);
  useTabPersistence(state);
  const [isExporting, setIsExporting] = useState(false);
  const connections = useConnectionsStore((store) => store.connections);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
  // Track last executed SQL per tab for export
  const lastExecutedSqlRef = useRef<Map<string, { sql: string; connectionId: string }>>(new Map());

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const tab = state.tabs.find((item) => item.id === tabId);
      if (!tab) return;

      const confirmationMessage = getCloseTabMessage(tab);
      if (confirmationMessage && !window.confirm(confirmationMessage)) {
        return;
      }

      if (tab.isExecuting) {
        if (!tab.runningQueryId) {
          toast.error("Cannot close tab while query status is unknown");
          return;
        }

        try {
          const result = await cancelQuery(tab.runningQueryId);
          if (result.cancelled) {
            toast.info("Query cancelled");
          } else {
            toast.warning("Could not cancel query — it may have already completed");
            return;
          }
        } catch {
          toast.error("Failed to cancel query");
          return;
        }

      }

      dispatch({ type: "CLOSE_TAB", tabId });
    },
    [state.tabs],
  );

  const handleExecute = useCallback(
    async (sqlOverride?: string) => {
      const rawSql = sqlOverride ?? activeTab?.sql ?? "";
      if (!rawSql.trim()) return;
      if (!activeTab) return;

      const connectionId = activeTab.connectionId ?? activeConnectionId;
      if (!connectionId) {
        dispatch({ type: "SET_ERROR", tabId: activeTab.id, error: "No connection selected" });
        return;
      }

      const vars = extractSmartVariables(rawSql);
      const sqlToRun = substituteSmartVariables(rawSql, vars, activeTab.variables);
      const tabId = activeTab.id;
      const runningDbType =
        connections.find((connection) => connection.id === connectionId)?.db_type ?? null;

      try {
        const submitted = await submitQueryRun({
          connection_id: connectionId,
          sql: sqlToRun,
          write_mode: activeTab.writeMode,
        });
        const runId = submitted.run_id;
        dispatch({ type: "START_EXECUTION", tabId, queryId: runId, dbType: runningDbType });

        while (true) {
          const run = await getQueryRun(runId);
          if (run.backend_pid) {
            dispatch({ type: "SET_BACKEND_PID", tabId, queryId: runId, pid: run.backend_pid });
          }
          if (run.status === "success") {
            const result = await getQueryRunResult(runId);
            lastExecutedSqlRef.current.set(tabId, { sql: sqlToRun, connectionId });
            dispatch({ type: "SET_RESULT", tabId, result, sql: sqlToRun, queryId: runId });
            return;
          }
          if (["error", "cancelled", "timeout"].includes(run.status)) {
            const message = run.error_message ?? `Query finished with status ${run.status}`;
            const isCancellation = run.status === "cancelled";
            if (!isCancellation) {
              toast.error("Query failed", { description: message });
            }
            dispatch({ type: "SET_ERROR", tabId, error: message, queryId: runId });
            return;
          }
          await sleep(RUN_POLL_INTERVAL_MS);
        }
      } catch (err) {
        let message = "Query execution failed";
        let position: number | null = null;
        if (err instanceof HTTPError) {
          try {
            const body = (await err.response.json()) as { message?: string; position?: number };
            message = body.message ?? message;
            position = body.position ?? null;
          } catch {
            message = `Request failed with status ${err.response.status}`;
          }
        } else if (err instanceof Error) {
          message = err.message;
        }
        const isCancellation =
          message.toLowerCase().includes("cancelled") || message.toLowerCase().includes("canceled");
        if (!isCancellation) {
          toast.error("Query failed", { description: message });
        }
        dispatch({ type: "SET_ERROR", tabId, error: message, position });
      }
    },
    [activeConnectionId, activeTab, connections],
  );

  const handleExplain = useCallback(
    async (sqlOverride?: string) => {
      const rawSql = sqlOverride ?? activeTab?.sql ?? "";
      if (!rawSql.trim()) return;
      if (!activeTab) return;

      const connectionId = activeTab.connectionId ?? activeConnectionId;
      if (!connectionId) {
        dispatch({ type: "SET_ERROR", tabId: activeTab.id, error: "No connection selected" });
        return;
      }

      const vars = extractSmartVariables(rawSql);
      const sqlToRun = substituteSmartVariables(rawSql, vars, activeTab.variables);
      const queryId = crypto.randomUUID();
      const tabId = activeTab.id;
      const runningDbType =
        connections.find((connection) => connection.id === connectionId)?.db_type ?? null;

      dispatch({ type: "START_EXECUTION", tabId, queryId, dbType: runningDbType });

      try {
        const result = await explainQuery({
          connection_id: connectionId,
          sql: sqlToRun,
          query_id: queryId,
        });
        dispatch({
          type: "SET_EXPLAIN_RESULT",
          tabId,
          plan: result.plan,
          query: result.query,
          dbType: runningDbType,
          queryId,
        });
      } catch (err) {
        let message = "EXPLAIN failed";
        let position: number | null = null;
        if (err instanceof HTTPError) {
          try {
            const body = (await err.response.json()) as { message?: string; position?: number };
            message = body.message ?? message;
            position = body.position ?? null;
          } catch {
            message = `Request failed with status ${err.response.status}`;
          }
        } else if (err instanceof Error) {
          message = err.message;
        }
        const isCancellation =
          message.toLowerCase().includes("cancelled") || message.toLowerCase().includes("canceled");
        if (!isCancellation) {
          toast.error("EXPLAIN failed", { description: message });
        }
        dispatch({ type: "SET_ERROR", tabId, error: message, position, queryId });
      }
    },
    [activeConnectionId, activeTab, connections],
  );

  const handleCancel = useCallback(async () => {
    const queryId = activeTab?.runningQueryId;
    if (!queryId) return;
    try {
      const result = await cancelQuery(queryId);
      if (result.cancelled) {
        toast.info("Query cancelled");
      } else {
        toast.warning("Could not cancel query — it may have already completed");
      }
    } catch {
      toast.error("Failed to cancel query");
    }
  }, [activeTab?.runningQueryId]);

  const handleExportAll = useCallback(
    async (format: "csv" | "json") => {
      if (!activeTab) return;
      const stored = lastExecutedSqlRef.current.get(activeTab.id);
      if (!stored) return;

      setIsExporting(true);
      try {
        const blob =
          format === "csv"
            ? await exportQueryCsv(stored.connectionId, stored.sql)
            : await exportQueryJson(stored.connectionId, stored.sql);
        const filename = format === "csv" ? "results.csv" : "results.json";
        downloadBlob(blob, filename);
        toast.success(`Exported as ${format.toUpperCase()}`);
      } catch {
        toast.error("Export failed");
      } finally {
        setIsExporting(false);
      }
    },
    [activeTab],
  );

  const handleCopyCsv = useCallback(() => {
    if (!activeTab?.result) return;
    copyToClipboard(resultsToCsv(activeTab.result));
    toast.success("Copied as CSV");
  }, [activeTab]);

  const handleCopyJson = useCallback(() => {
    if (!activeTab?.result) return;
    copyToClipboard(resultsToJson(activeTab.result));
    toast.success("Copied as JSON");
  }, [activeTab]);

  const handleExportCsv = useCallback(() => {
    if (!activeTab?.result) return;
    downloadFile(resultsToCsv(activeTab.result), "results.csv", "text/csv");
  }, [activeTab]);

  const handleReplayQuery = useCallback(
    (sql: string, connectionIdOverride?: string | null) => {
      const connectionId = resolveConnectionOverride(connectionIdOverride, activeConnectionId);
      const tab = createTab(connectionId ?? null);
      dispatch({ type: "ADD_TAB", tab });
      dispatch({ type: "UPDATE_SQL", tabId: tab.id, sql });
    },
    [activeConnectionId],
  );

  const handleOpenSchemaTab = useCallback(
    (
      schemaName: string,
      tableName: string,
      objectId?: string,
      connectionIdOverride?: string | null,
    ) => {
      const connectionId = resolveConnectionOverride(connectionIdOverride, activeConnectionId);
      if (!connectionId) return;
      // Reuse existing schema tab for the same table
      const existing = state.tabs.find(
        (t) =>
          t.schemaView?.schemaName === schemaName &&
          t.schemaView?.tableName === tableName &&
          t.connectionId === connectionId,
      );
      if (existing) {
        if (objectId) {
          dispatch({ type: "SET_SCHEMA_OBJECT_ID", tabId: existing.id, objectId });
        }
        dispatch({ type: "SET_ACTIVE_TAB", tabId: existing.id });
        return;
      }
      const tab = createSchemaTab(schemaName, tableName, connectionId, objectId);
      dispatch({ type: "ADD_TAB", tab });
    },
    [activeConnectionId, state.tabs],
  );

  const handleGenerateSelect = useCallback(
    async (
      schemaName: string,
      tableName: string,
      objectId?: string,
      connectionIdOverride?: string | null,
    ) => {
      const connectionId = resolveConnectionOverride(connectionIdOverride, activeConnectionId);
      const dbType =
        connections.find((connection) => connection.id === connectionId)?.db_type ?? null;
      let sql = fallbackPreviewText(dbType, schemaName, tableName);
      if (connectionId && objectId) {
        try {
          const detail = await fetchObjectDetail(connectionId, objectId);
          sql = detail.preview_operation.text;
        } catch {
          toast.error("Failed to build preview query");
          return;
        }
      }
      // If the active tab is empty, insert into it; otherwise open a new tab
      if (activeTab && !activeTab.sql.trim() && !activeTab.schemaView) {
        if (connectionId && activeTab.connectionId !== connectionId) {
          dispatch({ type: "SET_CONNECTION", tabId: activeTab.id, connectionId });
        }
        dispatch({ type: "UPDATE_SQL", tabId: activeTab.id, sql });
      } else {
        const tab = createTab(connectionId ?? null);
        dispatch({ type: "ADD_TAB", tab });
        dispatch({ type: "UPDATE_SQL", tabId: tab.id, sql });
        dispatch({ type: "RENAME_TAB", tabId: tab.id, title: tableName });
      }
    },
    [activeConnectionId, activeTab, connections, dispatch],
  );

  const handleFormatSql = useCallback(async () => {
    if (!activeTab?.sql.trim()) return;
    const dialect = getSelectedConnectionDbType(
      activeTab.connectionId,
      activeConnectionId,
      connections,
    );
    try {
      const formatted = await formatSql(activeTab.sql, dialect);
      dispatch({ type: "UPDATE_SQL", tabId: activeTab.id, sql: formatted });
      toast.success("SQL formatted");
    } catch {
      toast.error("Failed to format SQL");
    }
  }, [activeConnectionId, activeTab, connections, dispatch]);

  return (
    <EditorContext.Provider
      value={{
        state,
        dispatch,
        activeTab,
        handleCloseTab,
        handleExecute,
        handleExplain,
        handleCancel,
        handleExportAll,
        isExporting,
        handleCopyCsv,
        handleCopyJson,
        handleExportCsv,
        handleReplayQuery,
        handleOpenSchemaTab,
        handleGenerateSelect,
        handleFormatSql,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

const noop = () => {};
const noopAsync = () => Promise.resolve();

/** Safe fallback for transient states (HMR, error recovery). */
function useFallbackContext(): EditorContextValue {
  return useMemo<EditorContextValue>(
    () => ({
      state: { tabs: [], activeTabId: "" },
      dispatch: noop,
      activeTab: undefined,
      handleCloseTab: noopAsync,
      handleExecute: noopAsync,
      handleExplain: noopAsync,
      handleCancel: noopAsync,
      handleExportAll: noopAsync,
      isExporting: false,
      handleCopyCsv: noop,
      handleCopyJson: noop,
      handleExportCsv: noop,
      handleReplayQuery: noop,
      handleOpenSchemaTab: noop,
      handleGenerateSelect: noopAsync,
      handleFormatSql: noopAsync,
    }),
    [],
  );
}

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  const fallback = useFallbackContext();
  if (!ctx) {
    console.warn("[EditorContext] used outside EditorProvider — returning no-op fallback");
  }
  return ctx ?? fallback;
}
