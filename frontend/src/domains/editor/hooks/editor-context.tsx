import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  executeQuery,
  explainQuery,
  cancelQuery,
  getRunningQuery,
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
    connectionIdOverride?: string | null,
  ) => void;
  handleGenerateSelect: (
    schemaName: string,
    tableName: string,
    connectionIdOverride?: string | null,
  ) => void;
  handleFormatSql: () => Promise<void>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

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
  const pidTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = pidTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

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

        const pidTimer = pidTimersRef.current.get(tab.runningQueryId);
        if (pidTimer) {
          clearTimeout(pidTimer);
          pidTimersRef.current.delete(tab.runningQueryId);
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
      const queryId = crypto.randomUUID();
      const tabId = activeTab.id;
      const runningDbType =
        connections.find((connection) => connection.id === connectionId)?.db_type ?? null;

      dispatch({ type: "START_EXECUTION", tabId, queryId, dbType: runningDbType });

      // Fetch backend PID shortly after execute starts (server needs a moment to register)
      const pidTimer = setTimeout(() => {
        getRunningQuery(queryId)
          .then((info) => {
            if (info.pid) {
              dispatch({ type: "SET_BACKEND_PID", tabId, queryId, pid: info.pid });
            }
          })
          .catch(() => {
            /* ignore — best-effort */
          });
      }, 300);
      pidTimersRef.current.set(queryId, pidTimer);

      try {
        const result = await executeQuery({
          connection_id: connectionId,
          sql: sqlToRun,
          write_mode: activeTab.writeMode,
          query_id: queryId,
        });
        lastExecutedSqlRef.current.set(tabId, { sql: sqlToRun, connectionId });
        dispatch({ type: "SET_RESULT", tabId, result, sql: sqlToRun, queryId });
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
        dispatch({ type: "SET_ERROR", tabId, error: message, position, queryId });
      } finally {
        clearTimeout(pidTimer);
        pidTimersRef.current.delete(queryId);
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

      const pidTimer = setTimeout(() => {
        getRunningQuery(queryId)
          .then((info) => {
            if (info.pid) {
              dispatch({ type: "SET_BACKEND_PID", tabId, queryId, pid: info.pid });
            }
          })
          .catch(() => {
            /* ignore */
          });
      }, 300);
      pidTimersRef.current.set(queryId, pidTimer);

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
      } finally {
        clearTimeout(pidTimer);
        pidTimersRef.current.delete(queryId);
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
    (schemaName: string, tableName: string, connectionIdOverride?: string | null) => {
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
        dispatch({ type: "SET_ACTIVE_TAB", tabId: existing.id });
        return;
      }
      const tab = createSchemaTab(schemaName, tableName, connectionId);
      dispatch({ type: "ADD_TAB", tab });
    },
    [activeConnectionId, state.tabs],
  );

  const handleGenerateSelect = useCallback(
    (schemaName: string, tableName: string, connectionIdOverride?: string | null) => {
      const connectionId = resolveConnectionOverride(connectionIdOverride, activeConnectionId);
      const sql = `SELECT * FROM ${schemaName}.${tableName} LIMIT 100;`;
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
    [activeConnectionId, activeTab, dispatch],
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
      handleGenerateSelect: noop,
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
