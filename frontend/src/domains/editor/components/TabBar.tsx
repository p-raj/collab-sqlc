import { X, Plus } from "lucide-react";
import { IconButton } from "@/shared/components/ui/IconButton";
import { TabStripAction, TabStripGroup, TabStripRoot, TabStripTab } from "@/shared/components/ui/TabStrip";
import type { Tab } from "../types";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void | Promise<void>;
  onAdd: () => void;
}

export function TabBar({ tabs, activeTabId, onSelect, onClose, onAdd }: TabBarProps) {
  return (
    <TabStripRoot role="tablist" aria-label="Editor tabs">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDirty = tab.sql !== tab.savedSql;
        return (
          <TabStripGroup key={tab.id} active={isActive}>
            <TabStripTab
              active={isActive}
              hasAction={tabs.length > 1}
              onClick={() => onSelect(tab.id)}
              indicator={
                isDirty ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    title="Unsaved changes"
                  />
                ) : null
              }
              className="max-w-[220px]"
            >
              <span className={tab.savedQueryId ? undefined : "italic"}>
                {tab.savedQueryId && tab.folderName ? (
                  <span className="text-muted-foreground/60">{tab.folderName} / </span>
                ) : null}
                {tab.title}
              </span>
            </TabStripTab>
            {tabs.length > 1 && (
              <TabStripAction
                aria-label={`Close ${tab.title}`}
                onClick={() => void onClose(tab.id)}
                icon={<X size={12} />}
              />
            )}
          </TabStripGroup>
        );
      })}
      <IconButton
        aria-label="New tab"
        onClick={onAdd}
        size="sm"
        icon={<Plus size={14} />}
        title="New tab"
      />
    </TabStripRoot>
  );
}
