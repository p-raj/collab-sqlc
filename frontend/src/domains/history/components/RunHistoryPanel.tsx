import { useCallback, useEffect, useReducer, useState } from "react";
import {
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { EmptyState, LoadingState } from "@/shared/components/ui/DataState";
import { IconButton } from "@/shared/components/ui/IconButton";
import { ObjectListItem } from "@/shared/components/ui/ObjectListItem";
import { formatHistoryTimestamp } from "@/shared/utils/format-history-timestamp";
import * as historyApi from "../services/history-api";
import type { RunHistoryEntry } from "../types";

// ── State ──────────────────────────────────────────────────

interface HistoryState {
  entries: RunHistoryEntry[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  offset: number;
}

type HistoryAction =
  | { type: "SET_LOADING" }
  | { type: "SET_DATA"; entries: RunHistoryEntry[]; total: number; hasMore: boolean }
  | { type: "NEXT_PAGE" }
  | { type: "PREV_PAGE" }
  | { type: "RESET" };

const PAGE_SIZE = 20;

function reducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: true };
    case "SET_DATA":
      return {
        ...state,
        entries: action.entries,
        total: action.total,
        hasMore: action.hasMore,
        isLoading: false,
      };
    case "NEXT_PAGE":
      return { ...state, offset: state.offset + PAGE_SIZE };
    case "PREV_PAGE":
      return { ...state, offset: Math.max(0, state.offset - PAGE_SIZE) };
    case "RESET":
      return { entries: [], total: 0, hasMore: false, isLoading: false, offset: 0 };
  }
}

// ── Props ──────────────────────────────────────────────────

interface RunHistoryPanelProps {
  connectionId: string | null;
  onReplayQuery: (sql: string) => void;
}

// ── Component ──────────────────────────────────────────────

export function RunHistoryPanel({ connectionId, onReplayQuery }: RunHistoryPanelProps) {
  const user = useAuthStore((s) => s.user);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isAdmin = user?.role === "admin";

  const [state, dispatch] = useReducer(reducer, {
    entries: [],
    total: 0,
    hasMore: false,
    isLoading: false,
    offset: 0,
  });

  const loadHistory = useCallback(async () => {
    dispatch({ type: "SET_LOADING" });
    try {
      const data = await historyApi.fetchRunHistory(
        connectionId ?? undefined,
        PAGE_SIZE,
        state.offset,
      );
      dispatch({
        type: "SET_DATA",
        entries: data.items,
        total: data.total,
        hasMore: data.has_more,
      });
    } catch {
      dispatch({ type: "SET_DATA", entries: [], total: 0, hasMore: false });
    }
  }, [connectionId, state.offset]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleClear = useCallback(async () => {
    await historyApi.clearRunHistory();
    dispatch({ type: "RESET" });
  }, []);

  const handleCancel = useCallback(
    async (runId: string) => {
      try {
        const result = await historyApi.cancelRun(runId);
        if (result.cancelled) {
          toast.info("Query cancellation requested");
          await loadHistory();
        } else {
          toast.warning("Could not cancel query");
        }
      } catch {
        toast.error("Failed to cancel query");
      }
    },
    [loadHistory],
  );

  const currentPage = Math.floor(state.offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-1">
          <Clock size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Run History</span>
        </div>
        {!isAdmin && state.entries.length > 0 && (
          <IconButton
            aria-label="Clear history"
            onClick={() => setShowClearConfirm(true)}
            variant="danger"
            size="xs"
            icon={<Trash2 size={12} />}
            title="Clear history"
          />
        )}
      </div>

      {/* Loading */}
      {state.isLoading && state.entries.length === 0 && (
        <LoadingState label="Loading history" showLabel className="justify-start px-2 py-3" />
      )}

      {/* Entries */}
      {state.entries.map((entry) => {
        const isActive = entry.status === "queued" || entry.status === "running";
        return (
          <div
            key={entry.id}
            className="flex items-start gap-1.5 px-2 py-1.5 text-xs hover:bg-accent/50"
          >
            <ObjectListItem
              onClick={() => onReplayQuery(entry.sql)}
              className="items-start p-0 hover:bg-transparent"
              indicator={
                entry.status === "success" ? (
                  <CheckCircle2 size={10} className="mt-0.5 shrink-0 text-muted-foreground/60" />
                ) : isActive ? (
                  <Loader2 size={10} className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <XCircle size={10} className="mt-0.5 shrink-0 text-destructive/60" />
                )
              }
              title={`Click to load query\n${entry.sql}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground">{entry.sql}</p>
                <p className="text-[0.75rem] text-muted-foreground/60">
                  {isAdmin && (entry.user_display_name || entry.user_email)
                    ? `${entry.user_display_name ?? "Unknown user"}${entry.user_email ? ` · ${entry.user_email}` : ""} · `
                    : ""}
                  {entry.source === "query_api" ? "API · " : ""}
                  {entry.status}
                </p>
                <p className="text-[0.75rem] text-muted-foreground/60">
                  {entry.status === "success"
                    ? `${entry.row_count ?? 0} rows · ${entry.execution_time_ms?.toFixed(0) ?? "?"}ms`
                    : isActive
                      ? entry.backend_pid
                        ? `PID ${entry.backend_pid}`
                        : entry.backend_query_id
                          ? `Query ${entry.backend_query_id.slice(0, 8)}`
                          : "Waiting for worker"
                      : (entry.error_message?.slice(0, 60) ?? entry.status)}
                  {" · "}
                  {formatHistoryTimestamp(entry.created_at)}
                </p>
              </div>
            </ObjectListItem>
            {isActive && (
              <IconButton
                aria-label="Cancel run"
                onClick={() => handleCancel(entry.id)}
                variant="danger"
                size="xs"
                icon={<StopCircle size={12} />}
                title="Cancel run"
              />
            )}
          </div>
        );
      })}

      {/* Empty */}
      {state.entries.length === 0 && !state.isLoading && (
        <EmptyState title="No history yet" className="items-start px-2 py-2 text-left" />
      )}

      {/* Pagination */}
      {state.total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-2 py-1 text-[0.75rem] text-muted-foreground">
          <IconButton
            aria-label="Previous history page"
            onClick={() => dispatch({ type: "PREV_PAGE" })}
            disabled={state.offset === 0}
            size="xs"
            icon={<ChevronLeft size={10} />}
          />
          <span>
            {currentPage}/{totalPages}
          </span>
          <IconButton
            aria-label="Next history page"
            onClick={() => dispatch({ type: "NEXT_PAGE" })}
            disabled={!state.hasMore}
            size="xs"
            icon={<ChevronRight size={10} />}
          />
        </div>
      )}

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear run history"
          message="This will permanently delete all run history entries. Continue?"
          confirmLabel="Clear all"
          variant="danger"
          onConfirm={() => {
            handleClear();
            setShowClearConfirm(false);
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
