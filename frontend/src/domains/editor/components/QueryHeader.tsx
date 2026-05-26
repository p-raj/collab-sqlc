import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import {
  MoreHorizontal,
  Copy as CopyIcon,
  Files,
  XCircle,
  FolderInput,
  Play,
  AlignLeft,
  Save,
  Square,
  ChevronDown,
  ListTree,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getDatabaseEngine } from "@/domains/connections/engine-registry";
import type { DatabaseType } from "@/domains/connections/types";
import { useEditorContext } from "../hooks/editor-context";
import type { EditorSavedQueryFolder } from "../hooks/editor-saved-query-context";
import { copyToClipboard } from "../services/export-utils";
import { SaveQueryPopover } from "./SaveQueryPopover";

interface QueryHeaderProps {
  isExecuting: boolean;
  hasSelection: boolean;
  backendPid: number | null;
  showSavePopover: boolean;
  onShowSavePopover: (show: boolean) => void;
  onRun: () => void;
  onExplain: () => void;
  onCancel: () => void;
  onFormat: () => void;
  connectionId: string | null;
  connectionDbType: DatabaseType | null;
  folders: EditorSavedQueryFolder[];
  onSave: () => void;
  onSaveAs: (
    title: string,
    description?: string,
    folderId?: string | null,
    isShared?: boolean,
  ) => void;
  onMoveToFolder: (folderId: string | null) => void;
  renderSaveMenuItems?: (closeMenu: () => void) => ReactNode;
  renderMoreMenuItems?: (closeMenu: () => void) => ReactNode;
}

export function QueryHeader({
  isExecuting,
  hasSelection,
  backendPid,
  showSavePopover,
  onShowSavePopover,
  onRun,
  onExplain,
  onCancel,
  onFormat,
  connectionId,
  connectionDbType,
  folders,
  onSave,
  onSaveAs,
  onMoveToFolder,
  renderSaveMenuItems,
  renderMoreMenuItems,
}: QueryHeaderProps) {
  const { activeTab, dispatch } = useEditorContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMoveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleDuplicate = useCallback(() => {
    if (!activeTab) return;
    dispatch({ type: "DUPLICATE_TAB", sourceTabId: activeTab.id });
    setMenuOpen(false);
  }, [activeTab, dispatch]);

  const handleCloseOthers = useCallback(() => {
    if (!activeTab) return;
    dispatch({ type: "CLOSE_OTHER_TABS", keepTabId: activeTab.id });
    setMenuOpen(false);
  }, [activeTab, dispatch]);

  const handleCopySql = useCallback(() => {
    if (!activeTab?.sql) return;
    void copyToClipboard(activeTab.sql);
    toast.success("SQL copied to clipboard");
    setMenuOpen(false);
  }, [activeTab]);

  const handleMove = useCallback(
    (folderId: string | null) => {
      onMoveToFolder(folderId);
      setMoveMenuOpen(false);
      setMenuOpen(false);
    },
    [onMoveToFolder],
  );

  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  const engine = connectionDbType ? getDatabaseEngine(connectionDbType) : null;
  const supportsCancel = engine?.capabilities.cancel ?? false;
  const supportsExplain = engine?.capabilities.explain ?? false;

  useEffect(() => {
    if (!saveMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setSaveMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [saveMenuOpen]);

  const preserveEditorCursor = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  if (!activeTab) return null;

  const isSchema = activeTab.schemaView !== null;

  const startEditing = () => {
    if (isSchema) return;
    setDraft(activeTab.title);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== activeTab.title) {
      dispatch({ type: "RENAME_TAB", tabId: activeTab.id, title: trimmed });
    }
    setEditing(false);
  };

  return (
    <div className="flex h-8 items-center gap-1.5 border-b bg-card px-3">
      {/* [Name] */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-6 rounded border border-input bg-transparent px-1.5 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <button
          onClick={startEditing}
          className={`truncate text-sm text-foreground ${isSchema ? "cursor-default" : "cursor-text hover:text-muted-foreground"}`}
        >
          {activeTab.folderName && (
            <span className="font-normal text-muted-foreground">{activeTab.folderName} / </span>
          )}
          <span className="font-medium">{activeTab.title}</span>
          {!activeTab.savedQueryId && !isSchema && (
            <span className="ml-1.5 text-[0.75rem] font-normal text-muted-foreground/50">
              unsaved
            </span>
          )}
        </button>
      )}

      {!isSchema && (
        <div className="ml-4 flex items-center gap-1.5">
          {/* [Run] or engine-supported running state */}
          {isExecuting ? (
            <div className="flex items-center gap-1.5">
              {supportsCancel ? (
                <button
                  onClick={onCancel}
                  className="inline-flex h-6 items-center gap-1 rounded bg-destructive px-2.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                >
                  <Square size={10} fill="currentColor" />
                  Cancel
                </button>
              ) : (
                <span className="inline-flex h-6 items-center gap-1 rounded border border-input px-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" />
                  Running
                </span>
              )}
              {backendPid !== null && (
                <span className="font-mono text-[0.75rem] text-muted-foreground">
                  PID {backendPid}
                </span>
              )}
            </div>
          ) : (
            <button
              onMouseDown={preserveEditorCursor}
              onClick={onRun}
              disabled={!activeTab.sql.trim()}
              className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Play size={12} />
              {hasSelection ? "Run Selection" : "Run"}
            </button>
          )}

          {/* [Explain] — shown when the selected engine advertises support */}
          {!isExecuting && supportsExplain && (
            <button
              onMouseDown={preserveEditorCursor}
              onClick={onExplain}
              disabled={!activeTab.sql.trim()}
              className="inline-flex h-6 items-center gap-1 rounded border border-input px-2 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              title="Explain Analyze (⌘⇧E)"
            >
              <ListTree size={12} />
              Explain
            </button>
          )}

          {/* [Format] */}
          <button
            onClick={onFormat}
            disabled={!activeTab.sql.trim()}
            className="inline-flex h-6 items-center gap-1 rounded border border-input px-2 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
            title="Format SQL"
          >
            <AlignLeft size={12} />
            Format
          </button>

          {/* [Save ▾ / Save As] */}
          <div className="relative" ref={saveMenuRef}>
            <div className="flex items-center">
              <button
                onClick={onSave}
                disabled={!activeTab.sql.trim()}
                className="inline-flex h-6 items-center gap-1 rounded-l border border-input px-2 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                title="Save (⌘S)"
              >
                <Save size={12} />
                Save
              </button>
              <button
                onClick={() => setSaveMenuOpen((p) => !p)}
                disabled={!activeTab.sql.trim()}
                aria-label="Save options"
                className="inline-flex h-6 items-center rounded-r border border-l-0 border-input px-1 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <ChevronDown size={12} />
              </button>
            </div>
            {saveMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-md border bg-popover py-1 shadow-md">
                <button
                  onClick={() => {
                    setSaveMenuOpen(false);
                    onShowSavePopover(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent"
                >
                  Save As…
                </button>
                {renderSaveMenuItems?.(() => setSaveMenuOpen(false))}
              </div>
            )}
            {showSavePopover && (
              <SaveQueryPopover
                sql={activeTab.sql}
                connectionId={connectionId}
                folders={folders}
                defaultTitle={activeTab.title}
                onClose={() => onShowSavePopover(false)}
                onSaved={onSaveAs}
              />
            )}
          </div>

          {/* [...] More options */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((p) => !p)}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent"
              title="More options"
            >
              <MoreHorizontal size={14} />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover py-1 shadow-md">
                <button
                  onClick={handleDuplicate}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent"
                >
                  <Files size={12} />
                  Duplicate tab
                </button>
                <button
                  onClick={handleCloseOthers}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent"
                >
                  <XCircle size={12} />
                  Close other tabs
                </button>
                <button
                  onClick={handleCopySql}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent"
                >
                  <CopyIcon size={12} />
                  Copy SQL to clipboard
                </button>
                {activeTab.savedQueryId && (
                  <>
                    <div className="my-1 border-t" />
                    <div
                      className="relative"
                      onMouseEnter={() => setMoveMenuOpen(true)}
                      onMouseLeave={() => setMoveMenuOpen(false)}
                    >
                      <button className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent">
                        <FolderInput size={12} />
                        Move to folder
                        <span className="ml-auto text-muted-foreground">›</span>
                      </button>
                      {moveMenuOpen && (
                        <div className="absolute left-full top-0 z-50 ml-0.5 w-44 rounded-md border bg-popover py-1 shadow-md">
                          <button
                            onClick={() => handleMove(null)}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent ${
                              !activeTab.folderName
                                ? "text-muted-foreground"
                                : "text-popover-foreground"
                            }`}
                          >
                            No folder (root)
                          </button>
                          {folders.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => handleMove(f.id)}
                              className={`flex w-full items-center gap-2 truncate px-3 py-1.5 text-xs hover:bg-accent ${
                                activeTab.folderName === f.name
                                  ? "text-muted-foreground"
                                  : "text-popover-foreground"
                              }`}
                            >
                              {f.name}
                            </button>
                          ))}
                          {folders.length === 0 && (
                            <span className="block px-3 py-1.5 text-xs text-muted-foreground">
                              No folders yet
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {renderMoreMenuItems?.(() => setMenuOpen(false))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
