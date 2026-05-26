import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createTab } from "@/domains/editor/hooks/editor-reducer";
import { useEditorContext } from "@/domains/editor/hooks/editor-context";
import { useSavedQueriesStore } from "@/domains/queries/hooks/use-saved-queries-store";
import type { SavedQuery } from "@/domains/queries/types";
import {
  buildFolderLookup,
  buildFolderPath,
  getFolderName,
} from "@/domains/queries/utils/saved-query-path";
import { formatHistoryTimestamp } from "@/shared/utils/format-history-timestamp";
import * as queryApiService from "../services/query-api";
import type { ExecutionLogEntry } from "../types";

const PAGE_SIZE = 20;
const HOSTED_QUERIES_LABEL = "Hosted Queries";

function trimError(message: string, max = 60): string {
  return message.length > max ? `${message.slice(0, max - 1)}…` : message;
}

interface Props {
  queryId?: string;
}

function buildHostedQueryPathLabel(
  queryId: string,
  queryTitle: string | null | undefined,
  queryById: Map<string, SavedQuery>,
  folderById: ReturnType<typeof buildFolderLookup>,
): string {
  const query = queryById.get(queryId);
  const title = query?.title ?? queryTitle ?? `Saved query ${queryId.slice(0, 8)}`;
  const folderSegments = buildFolderPath(query?.folder_id ?? null, folderById);
  const pathSegments =
    folderSegments[0]?.trim().toLowerCase() === HOSTED_QUERIES_LABEL.toLowerCase()
      ? folderSegments
      : [HOSTED_QUERIES_LABEL, ...folderSegments];

  return [...pathSegments, title].join(" / ");
}

function serializeParamValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function ExecutionLogsPanel({ queryId }: Props) {
  const { dispatch } = useEditorContext();
  const queries = useSavedQueriesStore((store) => store.queries);
  const folders = useSavedQueriesStore((store) => store.folders);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openingLogId, setOpeningLogId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const queryById = useMemo(() => new Map(queries.map((query) => [query.id, query])), [queries]);
  const folderById = useMemo(() => buildFolderLookup(folders), [folders]);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await queryApiService.fetchExecutionLogs(queryId, {
        limit: PAGE_SIZE,
        offset,
      });
      setLogs(data);
    } catch {
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [queryId, offset]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleOpenLog = useCallback(
    async (logId: string) => {
      setOpeningLogId(logId);
      try {
        const detail = await queryApiService.fetchExecutionLogDetail(logId);
        const tab = createTab(detail.connection_id);
        const folderName = getFolderName(
          queryById.get(detail.query_id)?.folder_id ?? null,
          folderById,
        );

        dispatch({ type: "ADD_TAB", tab });
        dispatch({ type: "UPDATE_SQL", tabId: tab.id, sql: detail.query_sql });
        dispatch({
          type: "RENAME_TAB",
          tabId: tab.id,
          title: detail.query_title ?? `Saved query ${detail.query_id.slice(0, 8)}`,
        });
        dispatch({
          type: "LINK_SAVED_QUERY",
          tabId: tab.id,
          savedQueryId: detail.query_id,
          folderName,
        });
        dispatch({ type: "SET_API_ENABLED", tabId: tab.id, enabled: true });
        dispatch({ type: "MARK_SAVED", tabId: tab.id });
        for (const [name, value] of Object.entries(detail.params_sent ?? {})) {
          dispatch({
            type: "SET_VARIABLE",
            tabId: tab.id,
            name,
            value: serializeParamValue(value),
          });
        }

        if (detail.response_data) {
          dispatch({
            type: "SET_RESULT",
            tabId: tab.id,
            result: {
              columns: detail.response_data.columns,
              column_types:
                detail.response_data.column_types ??
                Array.from({ length: detail.response_data.columns.length }, () => ""),
              rows: detail.response_data.rows,
              row_count: detail.response_data.row_count,
              execution_time_ms: detail.execution_time_ms ?? 0,
            },
            sql: detail.query_sql,
          });
          return;
        }

        if (detail.error) {
          dispatch({
            type: "SET_ERROR",
            tabId: tab.id,
            error: detail.error,
          });
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to open execution log");
      } finally {
        setOpeningLogId(null);
      }
    },
    [dispatch, folderById, queryById],
  );

  const currentPage = useMemo(() => Math.floor(offset / PAGE_SIZE) + 1, [offset]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-1">
          <Activity size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">API Execution Logs</span>
        </div>
      </div>

      {isLoading && logs.length === 0 && (
        <div className="flex items-center gap-1.5 px-2 py-3">
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      )}

      {logs.map((log) => {
        const isSuccess = log.status_code >= 200 && log.status_code < 300;
        const rowCount = log.response_preview?.row_count ?? 0;
        const queryPathLabel = buildHostedQueryPathLabel(
          log.query_id,
          log.query_title,
          queryById,
          folderById,
        );

        return (
          <button
            key={log.id}
            type="button"
            onClick={() => void handleOpenLog(log.id)}
            disabled={openingLogId === log.id}
            className="flex items-start gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-accent/50 disabled:opacity-60"
            title="Click to load query and logged results"
          >
            {openingLogId === log.id ? (
              <Loader2
                size={10}
                className="mt-0.5 shrink-0 animate-spin text-muted-foreground/60"
              />
            ) : isSuccess ? (
              <CheckCircle2 size={10} className="mt-0.5 shrink-0 text-muted-foreground/60" />
            ) : (
              <XCircle size={10} className="mt-0.5 shrink-0 text-destructive/60" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-foreground">{queryPathLabel}</p>
              <p className="text-[0.75rem] text-muted-foreground/60">
                {log.connection_name ?? log.connection_id}
                {log.caller_ip ? ` · ${log.caller_ip}` : ""}
              </p>
              <p className="text-[0.75rem] text-muted-foreground/60">
                {isSuccess
                  ? `${rowCount} rows · ${log.execution_time_ms?.toFixed(0) ?? "?"}ms`
                  : trimError(log.error ?? "Error")}
                {" · "}
                {formatHistoryTimestamp(log.created_at)}
              </p>
            </div>
          </button>
        );
      })}

      {logs.length === 0 && !isLoading && (
        <div className="px-2 py-2 text-xs text-muted-foreground/60">No API execution logs yet.</div>
      )}

      {(offset > 0 || logs.length === PAGE_SIZE) && (
        <div className="flex items-center justify-between px-2 py-1 text-[0.75rem] text-muted-foreground">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft size={10} />
          </button>
          <span>Page {currentPage}</span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={logs.length < PAGE_SIZE}
            className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
