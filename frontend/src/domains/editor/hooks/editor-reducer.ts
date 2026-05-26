import type { EditorAction, EditorState, Tab } from "../types";

let tabCounter = 1;

/** Sync tab counter from restored tabs to avoid ID collisions after browser restore. */
export function syncTabCounter(tabs: Tab[]): void {
  let max = 0;
  for (const tab of tabs) {
    const match = /^tab-(\d+)$/.exec(tab.id);
    if (match) {
      const num = parseInt(match[1]!, 10);
      if (num > max) max = num;
    }
  }
  if (max >= tabCounter) {
    tabCounter = max + 1;
  }
}

export function createTab(connectionId: string | null = null): Tab {
  const id = `tab-${tabCounter++}`;
  return {
    id,
    title: `Query ${tabCounter - 1}`,
    sql: "",
    executedSql: null,
    savedSql: "",
    savedQueryId: null,
    folderName: null,
    connectionId,
    result: null,
    error: null,
    errorPosition: null,
    schemaView: null,
    variables: {},
    writeMode: false,
    apiEnabled: false,
    explainPlan: null,
    explainQuery: null,
    explainDbType: null,
  };
}

export function createSchemaTab(schemaName: string, tableName: string, connectionId: string): Tab {
  const id = `tab-${tabCounter++}`;
  return {
    id,
    title: tableName,
    sql: "",
    executedSql: null,
    savedSql: "",
    savedQueryId: null,
    folderName: null,
    connectionId,
    result: null,
    error: null,
    errorPosition: null,
    schemaView: { schemaName, tableName, activeSection: "schema" },
    variables: {},
    writeMode: false,
    apiEnabled: false,
    explainPlan: null,
    explainQuery: null,
    explainDbType: null,
  };
}

function updateTab(state: EditorState, tabId: string, updates: Partial<Tab>): EditorState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "ADD_TAB":
      return {
        ...state,
        tabs: [...state.tabs, action.tab],
        activeTabId: action.tab.id,
      };

    case "CLOSE_TAB": {
      const closedTab = state.tabs.find((t) => t.id === action.tabId);
      const remaining = state.tabs.filter((t) => t.id !== action.tabId);
      if (remaining.length === 0) {
        const newTab = createTab(closedTab?.connectionId ?? null);
        return { ...state, tabs: [newTab], activeTabId: newTab.id, isExecuting: false };
      }
      const needsNewActive = state.activeTabId === action.tabId;
      return {
        ...state,
        tabs: remaining,
        activeTabId: needsNewActive ? remaining[remaining.length - 1]!.id : state.activeTabId,
      };
    }

    case "SET_ACTIVE_TAB":
      return { ...state, activeTabId: action.tabId };

    case "UPDATE_SQL":
      return updateTab(state, action.tabId, { sql: action.sql });

    case "SET_CONNECTION":
      return updateTab(state, action.tabId, { connectionId: action.connectionId });

    case "RENAME_TAB":
      return updateTab(state, action.tabId, { title: action.title });

    case "SET_EXECUTING":
      return { ...state, isExecuting: action.executing };

    case "SET_RESULT":
      return {
        ...updateTab(state, action.tabId, {
          result: action.result,
          error: null,
          errorPosition: null,
          executedSql: action.sql,
          explainPlan: null,
          explainQuery: null,
          explainDbType: null,
        }),
        isExecuting: false,
      };

    case "SET_ERROR":
      return {
        ...updateTab(state, action.tabId, {
          error: action.error,
          errorPosition: action.position ?? null,
          result: null,
          explainPlan: null,
          explainQuery: null,
          explainDbType: null,
        }),
        isExecuting: false,
      };

    case "SET_EXPLAIN_RESULT":
      return {
        ...updateTab(state, action.tabId, {
          explainPlan: action.plan,
          explainQuery: action.query,
          explainDbType: action.dbType,
          result: null,
          error: null,
          errorPosition: null,
        }),
        isExecuting: false,
      };

    case "SET_VARIABLE": {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab) return state;
      return updateTab(state, action.tabId, {
        variables: { ...tab.variables, [action.name]: action.value },
      });
    }

    case "MARK_SAVED":
      return updateTab(state, action.tabId, {
        savedSql: state.tabs.find((t) => t.id === action.tabId)?.sql ?? "",
      });

    case "LINK_SAVED_QUERY":
      return updateTab(state, action.tabId, {
        savedQueryId: action.savedQueryId,
        folderName:
          action.folderName ?? state.tabs.find((t) => t.id === action.tabId)?.folderName ?? null,
      });

    case "DUPLICATE_TAB": {
      const source = state.tabs.find((t) => t.id === action.sourceTabId);
      if (!source) return state;
      const dup = createTab(source.connectionId);
      return {
        ...state,
        tabs: [
          ...state.tabs,
          {
            ...dup,
            sql: source.sql,
            executedSql: source.executedSql,
            savedSql: source.sql,
            title: `${source.title} (copy)`,
          },
        ],
        activeTabId: dup.id,
      };
    }

    case "CLOSE_OTHER_TABS": {
      const kept = state.tabs.filter((t) => t.id === action.keepTabId);
      if (kept.length === 0) return state;
      return { ...state, tabs: kept, activeTabId: action.keepTabId };
    }

    case "TOGGLE_WRITE_MODE": {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab) return state;
      return updateTab(state, action.tabId, { writeMode: !tab.writeMode });
    }

    case "SET_API_ENABLED": {
      const tab = state.tabs.find((item) => item.id === action.tabId);
      if (!tab || tab.apiEnabled === action.enabled) return state;
      return updateTab(state, action.tabId, { apiEnabled: action.enabled });
    }

    case "SET_SCHEMA_SECTION": {
      const tab = state.tabs.find((item) => item.id === action.tabId);
      if (!tab?.schemaView) return state;
      return updateTab(state, action.tabId, {
        schemaView: { ...tab.schemaView, activeSection: action.section },
      });
    }
  }
}
