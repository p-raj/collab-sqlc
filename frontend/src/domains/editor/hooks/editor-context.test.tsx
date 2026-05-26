import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResult } from "../types";
import { EditorProvider, useEditorContext } from "./editor-context";

const executeQueryMock = vi.hoisted(() => vi.fn());
const connections = vi.hoisted(
  () =>
    [
      { id: "conn-pg", db_type: "postgresql" },
      { id: "conn-ch", db_type: "clickhouse" },
    ] as const,
);

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../services/query-api", () => ({
  executeQuery: executeQueryMock,
  explainQuery: vi.fn(),
  cancelQuery: vi.fn(),
  getRunningQuery: vi.fn(() => Promise.resolve({ running: true, pid: 123 })),
  exportQueryCsv: vi.fn(),
  exportQueryJson: vi.fn(),
  formatSql: vi.fn(),
}));

vi.mock("@/domains/connections/hooks/use-connections-store", () => ({
  useConnectionsStore: (selector: (state: { connections: typeof connections }) => unknown) =>
    selector({ connections }),
}));

const successfulResult: QueryResult = {
  columns: ["value"],
  column_types: ["integer"],
  rows: [[1]],
  row_count: 1,
  execution_time_ms: 1,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function setPersistedEditorTab() {
  localStorage.setItem(
    "codb:editor-tabs",
    JSON.stringify({
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Query 1",
          sql: "select 1",
          connectionId: "conn-pg",
          schemaView: null,
          variables: {},
          writeMode: false,
          apiEnabled: false,
        },
      ],
    }),
  );
}

function Probe() {
  const context = useEditorContext();

  return (
    <>
      <div data-testid="running-db">{context.runningConnectionDbType ?? ""}</div>
      <button type="button" onClick={() => void context.handleExecute()}>
        Run
      </button>
      <button
        type="button"
        onClick={() =>
          context.activeTab &&
          context.dispatch({
            type: "SET_CONNECTION",
            tabId: context.activeTab.id,
            connectionId: "conn-ch",
          })
        }
      >
        Switch tab connection
      </button>
    </>
  );
}

describe("EditorProvider", () => {
  beforeEach(() => {
    setPersistedEditorTab();
    executeQueryMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("keeps the running query database type stable if the tab connection changes", async () => {
    const execution = deferred<QueryResult>();
    executeQueryMock.mockReturnValue(execution.promise);

    render(
      <EditorProvider activeConnectionId={null}>
        <Probe />
      </EditorProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.getByTestId("running-db")).toHaveTextContent("postgresql");
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch tab connection" }));

    expect(screen.getByTestId("running-db")).toHaveTextContent("postgresql");

    execution.resolve(successfulResult);
    await waitFor(() => {
      expect(screen.getByTestId("running-db")).toHaveTextContent("");
    });
  });
});
