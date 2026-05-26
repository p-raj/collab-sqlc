import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  FolderOpen,
  FileText,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  Loader2,
  Save,
  Globe,
  Star,
  Copy,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import { Dialog } from "@/shared/components/Dialog";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { useSavedQueriesStore } from "../hooks/use-saved-queries-store";
import type { QueryFolder, SavedQuery } from "../types";

// ── State ──────────────────────────────────────────────────

interface PanelState {
  expandedFolders: Set<string>;
  creatingFolder: boolean;
  newFolderName: string;
  renamingFolderId: string | null;
  renameFolderName: string;
}

type PanelAction =
  | { type: "TOGGLE_FOLDER"; id: string }
  | { type: "START_CREATE_FOLDER" }
  | { type: "CANCEL_CREATE_FOLDER" }
  | { type: "SET_NEW_FOLDER_NAME"; name: string }
  | { type: "FOLDER_CREATED" }
  | { type: "START_RENAME_FOLDER"; id: string; currentName: string }
  | { type: "SET_RENAME_FOLDER_NAME"; name: string }
  | { type: "CANCEL_RENAME_FOLDER" }
  | { type: "FOLDER_RENAMED" };

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "TOGGLE_FOLDER": {
      const next = new Set(state.expandedFolders);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, expandedFolders: next };
    }
    case "START_CREATE_FOLDER":
      return { ...state, creatingFolder: true, newFolderName: "" };
    case "CANCEL_CREATE_FOLDER":
      return { ...state, creatingFolder: false, newFolderName: "" };
    case "SET_NEW_FOLDER_NAME":
      return { ...state, newFolderName: action.name };
    case "FOLDER_CREATED":
      return { ...state, creatingFolder: false, newFolderName: "" };
    case "START_RENAME_FOLDER":
      return { ...state, renamingFolderId: action.id, renameFolderName: action.currentName };
    case "SET_RENAME_FOLDER_NAME":
      return { ...state, renameFolderName: action.name };
    case "CANCEL_RENAME_FOLDER":
      return { ...state, renamingFolderId: null, renameFolderName: "" };
    case "FOLDER_RENAMED":
      return { ...state, renamingFolderId: null, renameFolderName: "" };
  }
}

// ── Props ──────────────────────────────────────────────────

interface SavedQueriesPanelProps {
  onOpenQuery: (query: SavedQuery) => void;
  onSaveCurrentQuery?: () => void;
}

// ── Component ──────────────────────────────────────────────

export function SavedQueriesPanel({ onOpenQuery, onSaveCurrentQuery }: SavedQueriesPanelProps) {
  const {
    folders,
    queries,
    favoriteIds,
    isLoading,
    loadAll,
    createFolder,
    renameFolder,
    toggleFolderShare,
    deleteFolder,
    deleteQuery,
    toggleFavorite,
    forkQuery,
  } = useSavedQueriesStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [viewingVersionsForQuery, setViewingVersionsForQuery] = useState<SavedQuery | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "query" | "folder"; id: string; name: string } | null>(null);

  const [state, dispatch] = useReducer(panelReducer, {
    expandedFolders: new Set<string>(),
    creatingFolder: false,
    newFolderName: "",
    renamingFolderId: null,
    renameFolderName: "",
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (state.creatingFolder) {
      inputRef.current?.focus();
    }
  }, [state.creatingFolder]);

  const handleCreateFolder = useCallback(async () => {
    const name = state.newFolderName.trim();
    if (!name) return;
    await createFolder(name);
    dispatch({ type: "FOLDER_CREATED" });
  }, [state.newFolderName, createFolder]);

  const handleRenameFolder = useCallback(async () => {
    const name = state.renameFolderName.trim();
    if (!name || !state.renamingFolderId) return;
    await renameFolder(state.renamingFolderId, name);
    dispatch({ type: "FOLDER_RENAMED" });
  }, [state.renameFolderName, state.renamingFolderId, renameFolder]);

  const handleToggleFavorite = useCallback(
    async (queryId: string) => {
      try {
        await toggleFavorite(queryId);
      } catch {
        toast.error("Failed to toggle favorite");
      }
    },
    [toggleFavorite],
  );

  const handleFork = useCallback(
    async (query: SavedQuery) => {
      try {
        const forked = await forkQuery(query.id);
        toast.success("Query duplicated", { description: forked.title });
        onOpenQuery(forked);
      } catch {
        toast.error("Failed to duplicate query");
      }
    },
    [forkQuery, onOpenQuery],
  );

  // Derived data
  const favoriteQueries = useMemo(
    () => queries.filter((q) => favoriteIds.has(q.id)),
    [queries, favoriteIds],
  );

  const sharedWithMe = useMemo(
    () => queries.filter((q) => q.is_shared && q.created_by !== currentUserId),
    [queries, currentUserId],
  );

  const rootQueries = queries.filter((q) => !q.folder_id);
  const queriesByFolder = (folderId: string) => queries.filter((q) => q.folder_id === folderId);

  if (isLoading && folders.length === 0 && queries.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-3">
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">Saved Queries</span>
        <div className="flex gap-0.5">
          {onSaveCurrentQuery && (
            <button
              onClick={onSaveCurrentQuery}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent"
              title="Save current query"
            >
              <Save size={12} />
            </button>
          )}
          <button
            onClick={() => dispatch({ type: "START_CREATE_FOLDER" })}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
            title="New folder"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* New folder input */}
      {state.creatingFolder && (
        <div className="px-2 pb-1">
          <input
            ref={inputRef}
            type="text"
            placeholder="Folder name..."
            value={state.newFolderName}
            onChange={(e) => dispatch({ type: "SET_NEW_FOLDER_NAME", name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") dispatch({ type: "CANCEL_CREATE_FOLDER" });
            }}
            onBlur={() => {
              if (!state.newFolderName.trim()) dispatch({ type: "CANCEL_CREATE_FOLDER" });
            }}
            className="h-6 w-full rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Favorites section */}
      {favoriteQueries.length > 0 && (
        <div className="mb-1">
          <div className="flex items-center gap-1 px-2 py-0.5">
            <Star size={10} className="text-yellow-500" />
            <span className="text-[0.75rem] font-medium text-muted-foreground">Favorites</span>
          </div>
          {favoriteQueries.map((q) => (
            <QueryRow
              key={`fav-${q.id}`}
              query={q}
              isFavorite
              isSharedByOther={q.is_shared && q.created_by !== currentUserId}
              onOpen={() => onOpenQuery(q)}
              onDelete={() => setConfirmDelete({ type: "query", id: q.id, name: q.title })}
              onToggleFavorite={() => handleToggleFavorite(q.id)}
              onFork={() => handleFork(q)}
              onViewHistory={() => setViewingVersionsForQuery(q)}
            />
          ))}
        </div>
      )}

      {/* Shared with me section */}
      {sharedWithMe.length > 0 && (
        <div className="mb-1">
          <div className="flex items-center gap-1 px-2 py-0.5">
            <Globe size={10} className="text-blue-500" />
            <span className="text-[0.75rem] font-medium text-muted-foreground">Shared with me</span>
          </div>
          {sharedWithMe.map((q) => (
            <QueryRow
              key={`shared-${q.id}`}
              query={q}
              isFavorite={favoriteIds.has(q.id)}
              isSharedByOther
              onOpen={() => onOpenQuery(q)}
              onDelete={() => setConfirmDelete({ type: "query", id: q.id, name: q.title })}
              onToggleFavorite={() => handleToggleFavorite(q.id)}
              onFork={() => handleFork(q)}
              onViewHistory={() => setViewingVersionsForQuery(q)}
            />
          ))}
        </div>
      )}

      {/* Folders */}
      {folders.map((folder) => (
        <FolderRow
          key={folder.id}
          folder={folder}
          queries={queriesByFolder(folder.id)}
          favoriteIds={favoriteIds}
          currentUserId={currentUserId}
          isExpanded={state.expandedFolders.has(folder.id)}
          isRenaming={state.renamingFolderId === folder.id}
          renameName={state.renameFolderName}
          onToggle={() => dispatch({ type: "TOGGLE_FOLDER", id: folder.id })}
          onOpenQuery={onOpenQuery}
          onDeleteFolder={() => setConfirmDelete({ type: "folder", id: folder.id, name: folder.name })}
          onToggleShare={() => toggleFolderShare(folder.id)}
          onDeleteQuery={(id) => {
            const q = queries.find((query) => query.id === id);
            setConfirmDelete({ type: "query", id, name: q?.title ?? "this query" });
          }}
          onStartRename={() =>
            dispatch({ type: "START_RENAME_FOLDER", id: folder.id, currentName: folder.name })
          }
          onRenameChange={(name) => dispatch({ type: "SET_RENAME_FOLDER_NAME", name })}
          onRenameSubmit={handleRenameFolder}
          onRenameCancel={() => dispatch({ type: "CANCEL_RENAME_FOLDER" })}
          onToggleFavorite={handleToggleFavorite}
          onFork={handleFork}
          onViewHistory={(q) => setViewingVersionsForQuery(q)}
        />
      ))}

      {/* Root queries (no folder) */}
      {rootQueries.map((q) => (
        <QueryRow
          key={q.id}
          query={q}
          isFavorite={favoriteIds.has(q.id)}
          isSharedByOther={q.is_shared && q.created_by !== currentUserId}
          onOpen={() => onOpenQuery(q)}
          onDelete={() => setConfirmDelete({ type: "query", id: q.id, name: q.title })}
          onToggleFavorite={() => handleToggleFavorite(q.id)}
          onFork={() => handleFork(q)}
          onViewHistory={() => setViewingVersionsForQuery(q)}
        />
      ))}

      {/* Empty */}
      {folders.length === 0 && queries.length === 0 && !isLoading && (
        <div className="px-2 py-2 text-xs text-muted-foreground/60">No saved queries yet</div>
      )}

      {/* Version History Dialog */}
      {viewingVersionsForQuery && (
        <Dialog
          title={`History — ${viewingVersionsForQuery.title}`}
          onClose={() => setViewingVersionsForQuery(null)}
        >
          <VersionHistoryPanel
            queryId={viewingVersionsForQuery.id}
            currentSql={viewingVersionsForQuery.sql}
            onRestored={() => {
              setViewingVersionsForQuery(null);
              loadAll();
            }}
          />
        </Dialog>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.type === "folder" ? "Delete folder" : "Delete query"}
          message={`Are you sure you want to delete "${confirmDelete.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            if (confirmDelete.type === "folder") {
              deleteFolder(confirmDelete.id);
            } else {
              deleteQuery(confirmDelete.id);
            }
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function FolderRow({
  folder,
  queries,
  favoriteIds,
  currentUserId,
  isExpanded,
  isRenaming,
  renameName,
  onToggle,
  onOpenQuery,
  onDeleteFolder,
  onToggleShare,
  onDeleteQuery,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onToggleFavorite,
  onFork,
  onViewHistory,
}: {
  folder: QueryFolder;
  queries: SavedQuery[];
  favoriteIds: Set<string>;
  currentUserId: string | undefined;
  isExpanded: boolean;
  isRenaming: boolean;
  renameName: string;
  onToggle: () => void;
  onOpenQuery: (q: SavedQuery) => void;
  onDeleteFolder: () => void;
  onToggleShare: () => void;
  onDeleteQuery: (id: string) => void;
  onStartRename: () => void;
  onRenameChange: (name: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onToggleFavorite: (id: string) => void;
  onFork: (q: SavedQuery) => void;
  onViewHistory: (q: SavedQuery) => void;
}) {
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.focus();
  }, [isRenaming]);

  return (
    <div>
      <div className="group flex items-center">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/50"
        >
          <ChevronRight
            size={10}
            className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
          <FolderOpen size={11} className="shrink-0 text-muted-foreground/70" />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameName}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit();
                if (e.key === "Escape") onRenameCancel();
              }}
              onBlur={onRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="h-5 w-full rounded border border-input bg-transparent px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <span className="truncate">{folder.name}</span>
          )}
          {folder.is_shared && (
            <Globe size={9} className="shrink-0 text-muted-foreground/50" />
          )}
          <span className="ml-auto shrink-0 text-[0.75rem] text-muted-foreground/50">
            {queries.length}
          </span>
        </button>
        {!isRenaming && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              className="mr-0.5 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              title="Rename folder"
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleShare();
              }}
              className={`mr-0.5 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100 ${folder.is_shared ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground"
                }`}
              title={folder.is_shared ? "Unshare folder" : "Share folder"}
            >
              <Globe size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder();
              }}
              className="mr-1 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
              title="Delete folder"
            >
              <Trash2 size={10} />
            </button>
          </>
        )}
      </div>
      {isExpanded &&
        queries.map((q) => (
          <QueryRow
            key={q.id}
            query={q}
            indent
            isFavorite={favoriteIds.has(q.id)}
            isSharedByOther={q.is_shared && q.created_by !== currentUserId}
            onOpen={() => onOpenQuery(q)}
            onDelete={() => onDeleteQuery(q.id)}
            onToggleFavorite={() => onToggleFavorite(q.id)}
            onFork={() => onFork(q)}
            onViewHistory={() => onViewHistory(q)}
          />
        ))}
      {isExpanded && queries.length === 0 && (
        <div className="py-1 pl-8 text-[0.75rem] text-muted-foreground/40">Empty</div>
      )}
    </div>
  );
}

function QueryRow({
  query,
  indent = false,
  isFavorite = false,
  isSharedByOther = false,
  onOpen,
  onDelete,
  onToggleFavorite,
  onFork,
  onViewHistory,
}: {
  query: SavedQuery;
  indent?: boolean;
  isFavorite?: boolean;
  isSharedByOther?: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onToggleFavorite?: () => void;
  onFork?: () => void;
  onViewHistory?: () => void;
}) {
  return (
    <div className="group flex items-center">
      <button
        onClick={onOpen}
        className={`flex flex-1 items-center gap-1.5 py-1 pr-2 text-xs hover:bg-accent/50 ${indent ? "pl-6" : "pl-2"
          }`}
        title={query.description ?? query.title}
      >
        <FileText size={11} className="shrink-0 text-muted-foreground/50" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1">
            <span className="truncate">{query.title}</span>
            {query.is_shared && (
              <span title="Shared">
                <Globe size={9} className="shrink-0 text-blue-500" />
              </span>
            )}
          </div>
          {query.description && (
            <span className="truncate text-[0.75rem] text-muted-foreground/60">
              {query.description}
            </span>
          )}
        </div>
      </button>
      <div className="flex shrink-0 items-center">
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`rounded p-0.5 ${isFavorite
                ? "text-yellow-500"
                : "text-muted-foreground/50 opacity-0 group-hover:opacity-100"
              } hover:bg-accent`}
            title={isFavorite ? "Unfavorite" : "Favorite"}
          >
            <Star size={10} fill={isFavorite ? "currentColor" : "none"} />
          </button>
        )}
        {isSharedByOther && onFork && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFork();
            }}
            className="rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
            title="Duplicate query"
          >
            <Copy size={10} />
          </button>
        )}
        {onViewHistory && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewHistory();
            }}
            className="rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
            title="Version history"
          >
            <Clock size={10} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="mr-1 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
          title="Delete query"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}
