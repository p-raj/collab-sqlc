import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseType } from "@/domains/connections/types";
import type { EditorState, Tab } from "../types";
import { ResultsArea } from "./ResultsArea";

const parsePlanMock = vi.hoisted(() => vi.fn());

let currentActiveTab: Tab | undefined;
let currentState: EditorState;

vi.mock("@/shared/contexts/theme-context", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({ language, value }: { language: string; value: string }) => (
    <div data-testid="monaco-editor" data-language={language}>
      {value}
    </div>
  ),
}));

vi.mock("../hooks/editor-context", () => ({
  useEditorContext: () => ({
    state: currentState,
    activeTab: currentActiveTab,
  }),
}));

vi.mock("../explain/plan-parser", () => ({
  parsePlan: parsePlanMock,
}));

vi.mock("./explain/PlanTree", () => ({
  PlanTree: () => <div data-testid="plan-tree" />,
}));

vi.mock("./explain/PlanDiagram", () => ({
  PlanDiagram: () => <div data-testid="plan-diagram" />,
}));

vi.mock("./explain/PlanGrid", () => ({
  PlanGrid: () => <div data-testid="plan-grid" />,
}));

vi.mock("./explain/PlanStats", () => ({
  PlanStats: () => <div data-testid="plan-stats" />,
}));

afterEach(() => {
  cleanup();
  parsePlanMock.mockReset();
  currentActiveTab = undefined;
});

function createExplainTab(plan: string, explainDbType: DatabaseType): Tab {
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
    explainPlan: plan,
    explainQuery: "select 1",
    explainDbType,
  };
}

function renderResultsArea() {
  currentState = {
    tabs: currentActiveTab ? [currentActiveTab] : [],
    activeTabId: currentActiveTab?.id ?? "",
    isExecuting: false,
  };

  return render(<ResultsArea />);
}

describe("ResultsArea", () => {
  it("uses the raw view for text EXPLAIN output without parsing it as JSON", async () => {
    currentActiveTab = createExplainTab("Expression ((Projection + Before ORDER BY))", "clickhouse");

    renderResultsArea();

    await waitFor(() => {
      expect(screen.getByTestId("monaco-editor")).toHaveAttribute("data-language", "plaintext");
    });
    expect(screen.queryByRole("button", { name: "Tree" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to parse EXPLAIN output/)).not.toBeInTheDocument();
    expect(parsePlanMock).not.toHaveBeenCalled();
  });

  it("uses the structured tree view for JSON EXPLAIN output", async () => {
    currentActiveTab = createExplainTab('[{"Plan":{"Node Type":"Result"}}]', "postgresql");
    parsePlanMock.mockReturnValue({
      root: {},
      executionTime: 0,
      planningTime: 0,
      maxDuration: 0,
      maxCost: 0,
      maxRows: 0,
      maxEstimateFactor: 0,
      maxSharedBlocks: 0,
      maxIo: 0,
      totalNodes: 1,
      flatNodes: [],
      isAnalyze: false,
    });

    renderResultsArea();

    await waitFor(() => {
      expect(screen.getByTestId("plan-tree")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Tree" })).toBeInTheDocument();
    expect(parsePlanMock).toHaveBeenCalledWith('[{"Plan":{"Node Type":"Result"}}]');
  });

  it("renders EXPLAIN output using the producing database type", async () => {
    currentActiveTab = {
      ...createExplainTab("Expression ((Projection + Before ORDER BY))", "clickhouse"),
      connectionId: "postgres-connection-after-switch",
    };

    renderResultsArea();

    await waitFor(() => {
      expect(screen.getByTestId("monaco-editor")).toHaveAttribute("data-language", "plaintext");
    });
    expect(parsePlanMock).not.toHaveBeenCalled();
  });
});
