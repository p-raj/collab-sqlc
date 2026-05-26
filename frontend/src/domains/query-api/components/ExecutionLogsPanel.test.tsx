import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExecutionLogsPanel } from "./ExecutionLogsPanel";

const fetchExecutionLogsMock = vi.fn();
const fetchExecutionLogDetailMock = vi.fn();
const dispatchMock = vi.fn();
const savedQueriesState = {
  queries: [
    {
      id: "query-1",
      title: "Members API",
      folder_id: "folder-1",
    },
  ],
  folders: [
    {
      id: "folder-1",
      name: "Customer APIs",
      parent_id: null,
    },
  ],
};
const createTabMock = vi.fn((_connectionId?: string | null) => ({
  id: "tab-log-1",
  title: "Query 1",
  sql: "",
  executedSql: null,
  savedSql: "",
  savedQueryId: null,
  folderName: null,
  connectionId: "conn-1",
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
}));

vi.mock("../services/query-api", () => ({
  fetchExecutionLogs: (...args: unknown[]) => fetchExecutionLogsMock(...args),
  fetchExecutionLogDetail: (...args: unknown[]) => fetchExecutionLogDetailMock(...args),
}));

vi.mock("@/domains/editor/hooks/editor-context", () => ({
  useEditorContext: () => ({
    dispatch: dispatchMock,
  }),
}));

vi.mock("@/domains/queries/hooks/use-saved-queries-store", () => ({
  useSavedQueriesStore: (
    selector: (state: {
      queries: Array<{ id: string; title: string; folder_id: string | null }>;
      folders: Array<{ id: string; name: string; parent_id: string | null }>;
    }) => unknown,
  ) => selector(savedQueriesState),
}));

vi.mock("@/domains/editor/hooks/editor-reducer", () => ({
  createTab: (connectionId?: string | null) => createTabMock(connectionId),
}));

afterEach(() => {
  cleanup();
  fetchExecutionLogsMock.mockReset();
  fetchExecutionLogDetailMock.mockReset();
  dispatchMock.mockReset();
  createTabMock.mockClear();
  savedQueriesState.folders[0]!.name = "Customer APIs";
});

describe("ExecutionLogsPanel", () => {
  it("matches the run-history information density", async () => {
    fetchExecutionLogsMock.mockResolvedValueOnce([
      {
        id: "log-1",
        query_id: "query-1",
        query_title: "Members API",
        connection_id: "conn-1",
        connection_name: "App DB",
        caller_ip: "127.0.0.1",
        status_code: 200,
        execution_time_ms: 184,
        response_preview: {
          row_count: 12,
          columns: ["id", "email", "name", "role", "created_at"],
        },
        created_at: "2026-05-05T00:00:00.000Z",
      },
    ]);

    render(<ExecutionLogsPanel />);

    await screen.findByText("API Execution Logs");
    await screen.findByText("Hosted Queries / Customer APIs / Members API");
    screen.getByText("App DB · 127.0.0.1");
    screen.getByText(/12 rows · 184ms ·/);
  });

  it("loads the saved query and logged results on click", async () => {
    fetchExecutionLogsMock.mockResolvedValueOnce([
      {
        id: "log-1",
        query_id: "query-1",
        query_title: "Members API",
        connection_id: "conn-1",
        connection_name: "App DB",
        caller_ip: "127.0.0.1",
        status_code: 200,
        execution_time_ms: 184,
        response_preview: {
          row_count: 12,
          columns: ["id", "email"],
        },
        created_at: "2026-05-05T00:00:00.000Z",
      },
    ]);
    fetchExecutionLogDetailMock.mockResolvedValueOnce({
      id: "log-1",
      query_id: "query-1",
      query_title: "Members API",
      query_sql: "select * from members",
      connection_id: "conn-1",
      connection_name: "App DB",
      caller_ip: "127.0.0.1",
      status_code: 200,
      execution_time_ms: 184,
      params_sent: {
        org_id: 56,
        is_deleted: false,
      },
      response_data: {
        columns: ["id", "email"],
        rows: [[1, "user@example.com"]],
        row_count: 1,
      },
      created_at: "2026-05-05T00:00:00.000Z",
    });

    render(<ExecutionLogsPanel />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: /hosted queries \/ customer apis \/ members api/i,
      }),
    );

    expect(fetchExecutionLogDetailMock).toHaveBeenCalledWith("log-1");
    await waitFor(() => expect(createTabMock).toHaveBeenCalledWith("conn-1"));
    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "ADD_TAB",
        tab: expect.objectContaining({ id: "tab-log-1" }),
      }),
    );
    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "LINK_SAVED_QUERY",
        tabId: "tab-log-1",
        savedQueryId: "query-1",
        folderName: "Customer APIs",
      }),
    );
    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "SET_VARIABLE",
        tabId: "tab-log-1",
        name: "org_id",
        value: "56",
      }),
    );
    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "SET_VARIABLE",
        tabId: "tab-log-1",
        name: "is_deleted",
        value: "false",
      }),
    );
    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "SET_RESULT",
        tabId: "tab-log-1",
        result: {
          columns: ["id", "email"],
          column_types: ["", ""],
          rows: [[1, "user@example.com"]],
          row_count: 1,
          execution_time_ms: 184,
        },
        sql: "select * from members",
      }),
    );
  });

  it("does not repeat the hosted root label when the folder already uses it", async () => {
    savedQueriesState.folders[0]!.name = "Hosted Queries";
    fetchExecutionLogsMock.mockResolvedValueOnce([
      {
        id: "log-1",
        query_id: "query-1",
        query_title: "Members API",
        connection_id: "conn-1",
        connection_name: "App DB",
        caller_ip: "127.0.0.1",
        status_code: 200,
        execution_time_ms: 184,
        response_preview: {
          row_count: 12,
          columns: ["id", "email"],
        },
        created_at: "2026-05-05T00:00:00.000Z",
      },
    ]);

    render(<ExecutionLogsPanel />);

    await screen.findByText("Hosted Queries / Members API");
    expect(screen.queryByText("Hosted Queries / Hosted Queries / Members API")).toBeNull();
  });

  it("shows an empty state when there are no logs", async () => {
    fetchExecutionLogsMock.mockResolvedValueOnce([]);

    render(<ExecutionLogsPanel />);

    await screen.findByText("API Execution Logs");
    await screen.findByText("No API execution logs yet.");
  });
});
