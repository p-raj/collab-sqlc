import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DatabaseType } from "@/domains/connections/types";
import type { Tab } from "../types";
import { QueryHeader } from "./QueryHeader";

const dispatchMock = vi.fn();
let currentActiveTab: Tab | undefined;

vi.mock("../hooks/editor-context", () => ({
  useEditorContext: () => ({
    activeTab: currentActiveTab,
    dispatch: dispatchMock,
  }),
}));

afterEach(() => {
  cleanup();
  dispatchMock.mockReset();
  currentActiveTab = undefined;
});

function createTab(): Tab {
  return {
    id: "tab-1",
    title: "Query 1",
    sql: "select 1",
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
  };
}

function createProps() {
  return {
    isExecuting: false,
    hasSelection: false,
    backendPid: null,
    showSavePopover: false,
    onShowSavePopover: vi.fn(),
    onRun: vi.fn(),
    onExplain: vi.fn(),
    onCancel: vi.fn(),
    onFormat: vi.fn(),
    connectionId: "conn-1",
    connectionDbType: "postgresql" as DatabaseType,
    folders: [],
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onMoveToFolder: vi.fn(),
  };
}

describe("QueryHeader", () => {
  it("keeps hook order stable when the active tab appears after an empty render", () => {
    const props = createProps();
    currentActiveTab = undefined;

    const view = render(<QueryHeader {...props} />);

    currentActiveTab = createTab();
    expect(() => view.rerender(<QueryHeader {...props} />)).not.toThrow();
  });

  it("keeps hook order stable when the active tab disappears", () => {
    const props = createProps();
    currentActiveTab = createTab();

    const view = render(<QueryHeader {...props} />);

    currentActiveTab = undefined;
    expect(() => view.rerender(<QueryHeader {...props} />)).not.toThrow();
  });

  it("shows a cancel action while PostgreSQL queries are running", () => {
    const props = { ...createProps(), isExecuting: true };
    currentActiveTab = createTab();

    render(<QueryHeader {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it("does not show a dead cancel action for ClickHouse queries", () => {
    const props = {
      ...createProps(),
      isExecuting: true,
      connectionDbType: "clickhouse" as DatabaseType,
    };
    currentActiveTab = createTab();

    render(<QueryHeader {...props} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("renders save menu extension items with a close handler", () => {
    const props = {
      ...createProps(),
      renderSaveMenuItems: (closeMenu: () => void) => (
        <button type="button" onClick={closeMenu}>
          Extra save action
        </button>
      ),
    };
    currentActiveTab = { ...createTab(), savedQueryId: "query-1" };

    render(<QueryHeader {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Save options" }));
    fireEvent.click(screen.getByRole("button", { name: "Extra save action" }));

    expect(screen.queryByRole("button", { name: "Extra save action" })).not.toBeInTheDocument();
  });
});
