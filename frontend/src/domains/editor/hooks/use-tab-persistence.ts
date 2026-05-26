import { useEffect, useRef } from "react";
import type { EditorState, Tab } from "../types";
import { createTab, syncTabCounter } from "./editor-reducer";

const STORAGE_KEY = "codb:editor-tabs";
const SAVE_DEBOUNCE_MS = 500;

/** Minimal tab shape stored in localStorage (no query results). */
interface PersistedTab {
  id: string;
  title: string;
  sql: string;
  savedQueryId?: string | null;
  folderName?: string | null;
  connectionId: string | null;
  schemaView: Tab["schemaView"];
  variables: Record<string, string>;
  writeMode?: boolean;
  apiEnabled?: boolean;
}

interface PersistedState {
  tabs: PersistedTab[];
  activeTabId: string;
}

function toPersistedTab(tab: Tab): PersistedTab {
  return {
    id: tab.id,
    title: tab.title,
    sql: tab.sql,
    savedQueryId: tab.savedQueryId,
    folderName: tab.folderName,
    connectionId: tab.connectionId,
    schemaView: tab.schemaView,
    variables: tab.variables,
    writeMode: tab.writeMode,
    apiEnabled: tab.apiEnabled,
  };
}

function fromPersistedTab(p: PersistedTab): Tab {
  const schemaView =
    p.schemaView == null
      ? null
      : {
          ...p.schemaView,
          activeSection: p.schemaView.activeSection ?? "schema",
        };
  return {
    id: p.id,
    title: p.title,
    sql: p.sql,
    executedSql: null,
    savedSql: p.sql,
    savedQueryId: p.savedQueryId ?? null,
    folderName: p.folderName ?? null,
    connectionId: p.connectionId ?? null,
    result: null,
    error: null,
    errorPosition: null,
    schemaView,
    variables: p.variables ?? {},
    writeMode: p.writeMode ?? false,
    apiEnabled: p.apiEnabled ?? false,
    explainPlan: null,
    explainQuery: null,
    explainDbType: null,
  };
}

/** Load persisted tabs from localStorage, or return null if none. */
export function loadPersistedState(): EditorState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(data.tabs) || data.tabs.length === 0) return null;
    const tabs = data.tabs.map(fromPersistedTab);
    const activeTabId = tabs.some((t) => t.id === data.activeTabId)
      ? data.activeTabId
      : tabs[0]!.id;
    return { tabs, activeTabId, isExecuting: false };
  } catch {
    return null;
  }
}

/** Hook that debounce-saves editor state to localStorage on changes. */
export function useTabPersistence(state: EditorState) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const data: PersistedState = {
        tabs: state.tabs.map(toPersistedTab),
        activeTabId: state.activeTabId,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Storage full or unavailable — silently ignore
      }
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [state.tabs, state.activeTabId]);
}

/** Compute the initial state: persisted tabs or a fresh tab. */
export function getInitialEditorState(): EditorState {
  const persisted = loadPersistedState();
  if (persisted) {
    syncTabCounter(persisted.tabs);
    return persisted;
  }
  const tab = createTab();
  return { tabs: [tab], activeTabId: tab.id, isExecuting: false };
}
