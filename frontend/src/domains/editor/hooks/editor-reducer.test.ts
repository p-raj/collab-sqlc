import { describe, expect, it } from "vitest";
import { createSchemaTab, createTab, editorReducer } from "./editor-reducer";

describe("editorReducer", () => {
  it("stores the executed sql for successful query results", () => {
    const tab = createTab("conn-1");
    const state = {
      tabs: [{ ...tab, sql: "select 1;\nselect 2;" }],
      activeTabId: tab.id,
      isExecuting: true,
    };

    const nextState = editorReducer(state, {
      type: "SET_RESULT",
      tabId: tab.id,
      result: {
        columns: ["value"],
        column_types: ["integer"],
        rows: [[2]],
        row_count: 1,
        execution_time_ms: 12,
      },
      sql: "select 2;",
    });

    expect(nextState.tabs[0]?.executedSql).toBe("select 2;");
    expect(nextState.tabs[0]?.sql).toBe("select 1;\nselect 2;");
    expect(nextState.isExecuting).toBe(false);
  });

  it("updates the active schema explorer section without dropping table context", () => {
    const tab = createSchemaTab("public", "users", "conn-1");
    const state = {
      tabs: [tab],
      activeTabId: tab.id,
      isExecuting: false,
    };

    const nextState = editorReducer(state, {
      type: "SET_SCHEMA_SECTION",
      tabId: tab.id,
      section: "erd",
    });

    expect(nextState.tabs[0]?.schemaView).toEqual({
      schemaName: "public",
      tableName: "users",
      activeSection: "erd",
    });
  });
});
