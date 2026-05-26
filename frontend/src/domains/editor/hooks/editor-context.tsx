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
import type { DatabaseType } from "@/domains/connections/types";
import { HTTPError } from "ky";
import { extractSmartVariables, substituteSmartVariables } from "../utils/smart-variables";
export { extractSmartVariables } from "../utils/smart-variables";

interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  activeTab: Tab | undefined;
  handleExecute: (sqlOverride?: string) => Promise<void>;
  handleExplain: (sqlOverride?: string) => Promise<void>;
  handleCancel: () => Promise<void>;
  handleExportAll: (format: "csv" | "json") => Promise<void>;
  isExporting: boolean;
  /** PostgreSQL backend PID of the currently running query, null when idle. */
  backendPid: number | null;
  /** Database type for the currently running query, stable even if the user switches tabs. */
  runningConnectionDbType: DatabaseType | null;
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
  const [backendPid, setBackendPid] = useState<number | null>(null);
  const [runningConnectionDbType, setRunningConnectionDbType] = useState<DatabaseType | null>(null);
  const connections = useConnectionsStore((store) => store.connections);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
  // Track last executed SQL per tab for export
  const lastExecutedSqlRef = useRef<Map<string, { sql: string; connectionId: string }>>(new Map());
  // Track current running query_id for cancellation
  const runningQueryIdRef = useRef<string | null>(null);

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
      runningQueryIdRef.current = queryId;

      setRunningConnectionDbType(
        connections.find((connection) => connection.id === connectionId)?.db_type ?? null,
      );
      dispatch({ type: "SET_EXECUTING", executing: true });
      setBackendPid(null);

      // Fetch backend PID shortly after execute starts (server needs a moment to register)
      const pidTimer = setTimeout(() => {
        getRunningQuery(queryId)
          .then((info) => {
            if (info.pid && runningQueryIdRef.current === queryId) {
              setBackendPid(info.pid);
            }
          })
          .catch(() => {
            /* ignore — best-effort */
          });
      }, 300);

      try {
        const result = await executeQuery({
          connection_id: connectionId,
          sql: sqlToRun,
          write_mode: activeTab.writeMode,
          query_id: queryId,
        });
        lastExecutedSqlRef.current.set(activeTab.id, { sql: sqlToRun, connectionId });
        dispatch({ type: "SET_RESULT", tabId: activeTab.id, result, sql: sqlToRun });
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
        dispatch({ type: "SET_ERROR", tabId: activeTab.id, error: message, position });
      } finally {
        clearTimeout(pidTimer);
        runningQueryIdRef.current = null;
        setRunningConnectionDbType(null);
        setBackendPid(null);
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
      runningQueryIdRef.current = queryId;

      setRunningConnectionDbType(
        connections.find((connection) => connection.id === connectionId)?.db_type ?? null,
      );
      dispatch({ type: "SET_EXECUTING", executing: true });
      setBackendPid(null);

      const pidTimer = setTimeout(() => {
        getRunningQuery(queryId)
          .then((info) => {
            if (info.pid && runningQueryIdRef.current === queryId) {
              setBackendPid(info.pid);
            }
          })
          .catch(() => {
            /* ignore */
          });
      }, 300);

      try {
        const result = await explainQuery({
          connection_id: connectionId,
          sql: sqlToRun,
          query_id: queryId,
        });
        dispatch({
          type: "SET_EXPLAIN_RESULT",
          tabId: activeTab.id,
          plan: result.plan,
          query: result.query,
          dbType: connections.find((connection) => connection.id === connectionId)?.db_type ?? null,
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
        dispatch({ type: "SET_ERROR", tabId: activeTab.id, error: message, position });
      } finally {
        clearTimeout(pidTimer);
        runningQueryIdRef.current = null;
        setRunningConnectionDbType(null);
        setBackendPid(null);
      }
    },
    [activeConnectionId, activeTab, connections],
  );

  const handleCancel = useCallback(async () => {
    const queryId = runningQueryIdRef.current;
    if (!queryId) return;
    try {
      const result = await cancelQuery(queryId);
      if (result.cancelled) {
        toast.info("Query cancelled");
        // Execute call will get the cancellation error and reset via SET_ERROR,
        // but clear the ref so we don't try to cancel again
        runningQueryIdRef.current = null;
      } else {
        toast.warning("Could not cancel query — it may have already completed");
      }
    } catch {
      toast.error("Failed to cancel query");
    }
  }, []);

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
        handleExecute,
        handleExplain,
        handleCancel,
        handleExportAll,
        isExporting,
        backendPid,
        runningConnectionDbType,
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
      state: { tabs: [], activeTabId: "", isExecuting: false },
      dispatch: noop,
      activeTab: undefined,
      handleExecute: noopAsync,
      handleExplain: noopAsync,
      handleCancel: noopAsync,
      handleExportAll: noopAsync,
      isExporting: false,
      backendPid: null,
      runningConnectionDbType: null,
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
