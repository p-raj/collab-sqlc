import { useCallback, useEffect, useReducer, useState } from "react";
import {
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
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
          <button
            onClick={() => setShowClearConfirm(true)}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
            title="Clear history"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Loading */}
      {state.isLoading && state.entries.length === 0 && (
        <div className="flex items-center gap-1.5 px-2 py-3">
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      )}

      {/* Entries */}
      {state.entries.map((entry) => (
        <button
          key={entry.id}
          onClick={() => onReplayQuery(entry.sql)}
          className="flex items-start gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-accent/50"
          title={`Click to load query\n${entry.sql}`}
        >
          {entry.status === "success" ? (
            <CheckCircle2 size={10} className="mt-0.5 shrink-0 text-muted-foreground/60" />
          ) : (
            <XCircle size={10} className="mt-0.5 shrink-0 text-destructive/60" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-foreground">{entry.sql}</p>
            <p className="text-[0.75rem] text-muted-foreground/60">
              {isAdmin && (entry.user_display_name || entry.user_email)
                ? `${entry.user_display_name ?? "Unknown user"}${entry.user_email ? ` · ${entry.user_email}` : ""} · `
                : ""}
            </p>
            <p className="text-[0.75rem] text-muted-foreground/60">
              {entry.status === "success"
                ? `${entry.row_count ?? 0} rows · ${entry.execution_time_ms?.toFixed(0) ?? "?"}ms`
                : (entry.error_message?.slice(0, 60) ?? "Error")}
              {" · "}
              {formatHistoryTimestamp(entry.created_at)}
            </p>
          </div>
        </button>
      ))}

      {/* Empty */}
      {state.entries.length === 0 && !state.isLoading && (
        <div className="px-2 py-2 text-xs text-muted-foreground/60">No history yet</div>
      )}

      {/* Pagination */}
      {state.total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-2 py-1 text-[0.75rem] text-muted-foreground">
          <button
            onClick={() => dispatch({ type: "PREV_PAGE" })}
            disabled={state.offset === 0}
            className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft size={10} />
          </button>
          <span>
            {currentPage}/{totalPages}
          </span>
          <button
            onClick={() => dispatch({ type: "NEXT_PAGE" })}
            disabled={!state.hasMore}
            className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight size={10} />
          </button>
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
