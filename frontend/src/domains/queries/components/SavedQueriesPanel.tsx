import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  FolderOpen,
  FileText,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
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
import { EmptyState, LoadingState } from "@/shared/components/ui/DataState";
import { IconButton } from "@/shared/components/ui/IconButton";
import { Input } from "@/shared/components/ui/Input";
import { ObjectListItem } from "@/shared/components/ui/ObjectListItem";
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
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "query" | "folder";
    id: string;
    name: string;
  } | null>(null);

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
      <LoadingState label="Loading saved queries" showLabel className="justify-start px-2 py-3" />
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">Saved Queries</span>
        <div className="flex gap-0.5">
          {onSaveCurrentQuery && (
            <IconButton
              aria-label="Save current query"
              onClick={onSaveCurrentQuery}
              size="xs"
              icon={<Save size={12} />}
              title="Save current query"
            />
          )}
          <IconButton
            aria-label="New folder"
            onClick={() => dispatch({ type: "START_CREATE_FOLDER" })}
            size="xs"
            icon={<Plus size={12} />}
            title="New folder"
          />
        </div>
      </div>

      {/* New folder input */}
      {state.creatingFolder && (
        <div className="px-2 pb-1">
          <Input
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
            size="xs"
          />
        </div>
      )}

      {/* Favorites section */}
      {favoriteQueries.length > 0 && (
        <div className="mb-1">
          <div className="flex items-center gap-1 px-2 py-0.5">
            <Star size={10} className="text-warning" />
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
            <Globe size={10} className="text-info" />
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
          onDeleteFolder={() =>
            setConfirmDelete({ type: "folder", id: folder.id, name: folder.name })
          }
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
        <EmptyState title="No saved queries yet" className="items-start px-2 py-2 text-left" />
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
        <ObjectListItem
          onClick={onToggle}
          indicator={
            <>
              <ChevronRight
                size={10}
                className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
              <FolderOpen size={11} className="shrink-0 text-muted-foreground/70" />
            </>
          }
          meta={
            <span className="ml-auto shrink-0 text-[0.75rem] text-muted-foreground/50">
              {queries.length}
            </span>
          }
        >
          {isRenaming ? (
            <Input
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
              size="xs"
            />
          ) : (
            <span className="truncate">{folder.name}</span>
          )}
          {folder.is_shared && <Globe size={9} className="shrink-0 text-muted-foreground/50" />}
        </ObjectListItem>
        {!isRenaming && (
          <>
            <IconButton
              aria-label="Rename folder"
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              size="xs"
              icon={<Pencil size={10} />}
              className="mr-0.5 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
              title="Rename folder"
            />
            <IconButton
              aria-label={folder.is_shared ? "Unshare folder" : "Share folder"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleShare();
              }}
              size="xs"
              icon={<Globe size={10} />}
              className={`mr-0.5 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100 ${
                folder.is_shared
                  ? "text-foreground"
                  : "text-muted-foreground/50 hover:text-foreground"
              }`}
              title={folder.is_shared ? "Unshare folder" : "Share folder"}
            />
            <IconButton
              aria-label="Delete folder"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder();
              }}
              variant="danger"
              size="xs"
              icon={<Trash2 size={10} />}
              className="mr-1 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
              title="Delete folder"
            />
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
      <ObjectListItem
        onClick={onOpen}
        indicator={<FileText size={11} className="shrink-0 text-muted-foreground/50" />}
        className={`py-1 pr-2 ${indent ? "pl-6" : "pl-2"}`}
        title={query.description ?? query.title}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1">
            <span className="truncate">{query.title}</span>
            {query.is_shared && (
              <span title="Shared">
                <Globe size={9} className="shrink-0 text-info" />
              </span>
            )}
          </div>
          {query.description && (
            <span className="truncate text-[0.75rem] text-muted-foreground/60">
              {query.description}
            </span>
          )}
        </div>
      </ObjectListItem>
      <div className="flex shrink-0 items-center">
        {onToggleFavorite && (
          <IconButton
            aria-label={isFavorite ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            size="xs"
            icon={<Star size={10} fill={isFavorite ? "currentColor" : "none"} />}
            className={`rounded p-0.5 ${
              isFavorite
                ? "text-warning"
                : "text-muted-foreground/50 opacity-0 group-hover:opacity-100"
            } hover:bg-accent`}
            title={isFavorite ? "Unfavorite" : "Favorite"}
          />
        )}
        {isSharedByOther && onFork && (
          <IconButton
            aria-label="Duplicate query"
            onClick={(e) => {
              e.stopPropagation();
              onFork();
            }}
            size="xs"
            icon={<Copy size={10} />}
            className="rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
            title="Duplicate query"
          />
        )}
        {onViewHistory && (
          <IconButton
            aria-label="Version history"
            onClick={(e) => {
              e.stopPropagation();
              onViewHistory();
            }}
            size="xs"
            icon={<Clock size={10} />}
            className="rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
            title="Version history"
          />
        )}
        <IconButton
          aria-label="Delete query"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          variant="danger"
          size="xs"
          icon={<Trash2 size={10} />}
          className="mr-1 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
          title="Delete query"
        />
      </div>
    </div>
  );
}
