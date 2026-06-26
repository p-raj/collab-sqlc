import { useCallback } from "react";
import { X, Plus } from "lucide-react";
import type { Tab } from "../types";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void | Promise<void>;
  onAdd: () => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onAdd }: TabBarProps) {
  const handleClose = useCallback(
    (tab: Tab, e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      void onClose(tab.id);
    },
    [onClose],
  );

  return (
    <div className="flex h-9 items-center gap-px overflow-x-auto border-b bg-card px-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDirty = tab.sql !== tab.savedSql;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`group flex h-7 items-center gap-1.5 rounded px-2.5 text-xs transition-colors ${
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <span className="max-w-[180px] truncate">
              {tab.savedQueryId ? (
                <>
                  {tab.folderName && (
                    <span className="text-muted-foreground/60">{tab.folderName} / </span>
                  )}
                  {tab.title}
                </>
              ) : (
                <span className="italic">{tab.title}</span>
              )}
            </span>
            {isDirty && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                title="Unsaved changes"
              />
            )}
            {tabs.length > 1 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleClose(tab, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleClose(tab, e);
                }}
                className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
              >
                <X size={12} />
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={onAdd}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/50"
        title="New tab"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
