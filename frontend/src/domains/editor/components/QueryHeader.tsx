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
import { Badge } from "@/shared/components/ui/Badge";
import { Button } from "@/shared/components/ui/Button";
import { IconButton } from "@/shared/components/ui/IconButton";
import { Input } from "@/shared/components/ui/Input";
import { MenuContent, MenuDivider, MenuItem } from "@/shared/components/ui/Menu";
import { useEditorContext } from "../hooks/editor-context";
import type { EditorSavedQueryFolder } from "../hooks/editor-saved-query-context";
import { copyToClipboard } from "../services/export-utils";
import { SaveQueryPopover } from "./SaveQueryPopover";

interface QueryHeaderProps {
  isExecuting: boolean;
  hasSelection: boolean;
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
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-6 text-sm font-medium"
        />
      ) : (
        <Button
          type="button"
          onClick={startEditing}
          variant="ghost"
          size="xs"
          className={`min-w-0 max-w-[18rem] justify-start truncate px-0 text-sm text-foreground hover:bg-transparent ${isSchema ? "cursor-default" : "cursor-text hover:text-muted-foreground"}`}
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
        </Button>
      )}

      {!isSchema && (
        <div className="ml-4 flex items-center gap-1.5">
          {/* [Run] or engine-supported running state */}
          {isExecuting ? (
            <div className="flex items-center gap-1.5">
              {supportsCancel ? (
                <Button
                  variant="danger"
                  size="xs"
                  onClick={onCancel}
                  leftIcon={<Square size={10} fill="currentColor" />}
                >
                  Cancel
                </Button>
              ) : (
                <Badge className="h-6 gap-1 border border-input bg-transparent">
                  <Loader2 size={12} className="animate-spin" />
                  Running
                </Badge>
              )}
            </div>
          ) : (
            <Button
              variant="primary"
              size="xs"
              onMouseDown={preserveEditorCursor}
              onClick={onRun}
              disabled={!activeTab.sql.trim()}
              leftIcon={<Play size={12} />}
            >
              {hasSelection ? "Run Selection" : "Run"}
            </Button>
          )}

          {/* [Explain] — shown when the selected engine advertises support */}
          {!isExecuting && supportsExplain && (
            <Button
              variant="secondary"
              size="xs"
              onMouseDown={preserveEditorCursor}
              onClick={onExplain}
              disabled={!activeTab.sql.trim()}
              title="Explain Analyze (⌘⇧E)"
              leftIcon={<ListTree size={12} />}
            >
              Explain
            </Button>
          )}

          {/* [Format] */}
          <Button
            variant="secondary"
            size="xs"
            onClick={onFormat}
            disabled={!activeTab.sql.trim()}
            title="Format SQL"
            leftIcon={<AlignLeft size={12} />}
          >
            Format
          </Button>

          {/* [Save ▾ / Save As] */}
          <div className="relative" ref={saveMenuRef}>
            <div className="flex items-center">
              <Button
                variant="secondary"
                size="xs"
                onClick={onSave}
                disabled={!activeTab.sql.trim()}
                className="rounded-r-none"
                title="Save (⌘S)"
                leftIcon={<Save size={12} />}
              >
                Save
              </Button>
              <IconButton
                variant="secondary"
                size="xs"
                onClick={() => setSaveMenuOpen((p) => !p)}
                disabled={!activeTab.sql.trim()}
                aria-label="Save options"
                className="rounded-l-none border-l-0"
                icon={<ChevronDown size={12} />}
              />
            </div>
            {saveMenuOpen && (
              <MenuContent className="absolute left-0 top-full z-50 mt-1 w-40">
                <MenuItem
                  onClick={() => {
                    setSaveMenuOpen(false);
                    onShowSavePopover(true);
                  }}
                >
                  Save As…
                </MenuItem>
                {renderSaveMenuItems?.(() => setSaveMenuOpen(false))}
              </MenuContent>
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
            <IconButton
              onClick={() => setMenuOpen((p) => !p)}
              title="More options"
              aria-label="More options"
              icon={<MoreHorizontal size={14} />}
            />

            {menuOpen && (
              <MenuContent className="absolute left-0 top-full z-50 mt-1 w-48">
                <MenuItem
                  onClick={handleDuplicate}
                >
                  <Files size={12} />
                  Duplicate tab
                </MenuItem>
                <MenuItem
                  onClick={handleCloseOthers}
                >
                  <XCircle size={12} />
                  Close other tabs
                </MenuItem>
                <MenuItem
                  onClick={handleCopySql}
                >
                  <CopyIcon size={12} />
                  Copy SQL to clipboard
                </MenuItem>
                {activeTab.savedQueryId && (
                  <>
                    <MenuDivider />
                    <div
                      className="relative"
                      onMouseEnter={() => setMoveMenuOpen(true)}
                      onMouseLeave={() => setMoveMenuOpen(false)}
                    >
                      <MenuItem rightSlot="›">
                        <FolderInput size={12} />
                        Move to folder
                      </MenuItem>
                      {moveMenuOpen && (
                        <MenuContent className="absolute left-full top-0 z-50 ml-0.5 w-44">
                          <MenuItem
                            onClick={() => handleMove(null)}
                            className={
                              !activeTab.folderName
                                ? "text-muted-foreground"
                                : "text-popover-foreground"
                            }
                          >
                            No folder (root)
                          </MenuItem>
                          {folders.map((f) => (
                            <MenuItem
                              key={f.id}
                              onClick={() => handleMove(f.id)}
                              className={`truncate ${
                                activeTab.folderName === f.name
                                  ? "text-muted-foreground"
                                  : "text-popover-foreground"
                              }`}
                            >
                              {f.name}
                            </MenuItem>
                          ))}
                          {folders.length === 0 && (
                            <span className="block px-3 py-1.5 text-xs text-muted-foreground">
                              No folders yet
                            </span>
                          )}
                        </MenuContent>
                      )}
                    </div>
                  </>
                )}
                {renderMoreMenuItems?.(() => setMenuOpen(false))}
              </MenuContent>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
