import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { CheckCircle2, XCircle, Copy, Download, Search, ListTree } from "lucide-react";
import MonacoEditor from "@monaco-editor/react";
import { getDatabaseEngine } from "@/domains/connections/engine-registry";
import { Button } from "@/shared/components/ui/Button";
import { CodeBlock, InlineCode } from "@/shared/components/ui/CodeBlock";
import { EmptyState, ErrorState, LoadingState } from "@/shared/components/ui/DataState";
import { Input } from "@/shared/components/ui/Input";
import { StatusIndicator } from "@/shared/components/ui/StatusIndicator";
import { TabButton, TabsRoot } from "@/shared/components/ui/Tabs";
import { Toolbar } from "@/shared/components/ui/Toolbar";
import { ToolbarGroup } from "@/shared/components/ui/ToolbarGroup";
import { useTheme } from "@/shared/contexts/theme-context";
import { useEditorContext } from "../hooks/editor-context";
import { ResultsTable } from "./ResultsTable";
import { PlanDiagram } from "./explain/PlanDiagram";
import { PlanTree } from "./explain/PlanTree";
import { PlanGrid } from "./explain/PlanGrid";
import { PlanStats } from "./explain/PlanStats";
import { parsePlan } from "../explain/plan-parser";
import type { Plan } from "../explain/types";
import type { QueryResult } from "../types";
import {
  resultsToCsv,
  resultsToJson,
  copyToClipboard,
  downloadFile,
} from "../services/export-utils";

type ResultsTab =
  | "sql"
  | "data"
  | "details"
  | "export"
  | "tree"
  | "plan"
  | "grid"
  | "stats"
  | "raw";

export function ResultsArea() {
  const { activeTab } = useEditorContext();
  const { resolvedTheme } = useTheme();
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>("data");
  const [searchQuery, setSearchQuery] = useState("");
  const engine = getDatabaseEngine(activeTab?.explainDbType ?? null);
  const explainOutputKind = engine.explain.outputKind;

  const result = activeTab?.result ?? null;
  const resultShape = result?.result_shape ?? "tabular";
  const error = activeTab?.error ?? null;
  const explainPlan = activeTab?.explainPlan ?? null;
  const hasResult = result !== null;
  const hasError = error !== null;
  const hasExplain = explainPlan !== null;
  const isExecuting = activeTab?.isExecuting ?? false;
  const backendPid = activeTab?.backendPid ?? null;
  const hasResultDetails = hasResult && resultShape !== "tabular";

  const filteredResult = useMemo(() => {
    if (!result || !searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase();
    const filteredRows = result.rows.filter((row) =>
      row.some((cell) =>
        String(cell ?? "")
          .toLowerCase()
          .includes(query),
      ),
    );
    return { ...result, rows: filteredRows, row_count: filteredRows.length };
  }, [result, searchQuery]);

  const handleCopyCsv = useCallback(() => {
    if (!result) return;
    void copyToClipboard(resultsToCsv(result));
  }, [result]);

  const handleCopyJson = useCallback(() => {
    if (!result) return;
    void copyToClipboard(resultsToJson(result));
  }, [result]);

  const handleDownloadCsv = useCallback(() => {
    if (!result) return;
    downloadFile(resultsToCsv(result), "results.csv", "text/csv");
  }, [result]);

  const handleDownloadJson = useCallback(() => {
    if (!result) return;
    downloadFile(resultsToJson(result), "results.json", "application/json");
  }, [result]);

  const { parsedPlan, planParseError } = useMemo<{
    parsedPlan: Plan | null;
    planParseError: string | null;
  }>(() => {
    if (!explainPlan) return { parsedPlan: null, planParseError: null };
    if (explainOutputKind !== "json") return { parsedPlan: null, planParseError: null };
    try {
      return { parsedPlan: parsePlan(explainPlan), planParseError: null };
    } catch (e) {
      return {
        parsedPlan: null,
        planParseError: e instanceof Error ? e.message : "Failed to parse EXPLAIN output",
      };
    }
  }, [explainOutputKind, explainPlan]);

  const tabs = useMemo<{ id: ResultsTab; label: string }[]>(
    () => [
      { id: "sql", label: "SQL" },
      { id: "data", label: "Data" },
      ...(hasResultDetails
        ? [{ id: "details" as const, label: getResultDetailsTabLabel(resultShape) }]
        : []),
      ...(hasExplain && explainOutputKind === "json"
        ? [
            { id: "tree" as const, label: "Tree" },
            { id: "plan" as const, label: "Plan" },
            { id: "grid" as const, label: "Grid" },
            { id: "stats" as const, label: "Stats" },
          ]
        : []),
      ...(hasExplain ? [{ id: "raw" as const, label: "Raw" }] : []),
      { id: "export", label: "Export" },
    ],
    [explainOutputKind, hasExplain, hasResultDetails, resultShape],
  );

  // Auto-select the engine's preferred EXPLAIN tab when a new plan arrives.
  const prevExplainRef = useRef<string | null>(null);
  useEffect(() => {
    if (explainPlan && explainPlan !== prevExplainRef.current) {
      setActiveResultsTab(engine.explain.defaultTab);
    }
    prevExplainRef.current = explainPlan;
  }, [engine.explain.defaultTab, explainPlan]);

  // Clamp activeResultsTab when switching editor tabs invalidates current selection
  useEffect(() => {
    const validIds = new Set(tabs.map((t) => t.id));
    if (!validIds.has(activeResultsTab)) {
      setActiveResultsTab("data");
    }
  }, [activeResultsTab, activeTab?.id, tabs]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Toolbar>
        <ToolbarGroup className="pr-4">
          {isExecuting && (
            <StatusIndicator
              label={backendPid !== null ? `PID ${backendPid}` : "Running"}
              loading
            />
          )}
          {!isExecuting && hasResult && (
            <StatusIndicator label="Success" icon={CheckCircle2} tone="success" />
          )}
          {!isExecuting && hasExplain && !hasResult && !hasError && (
            <StatusIndicator label="Plan" icon={ListTree} tone="success" />
          )}
          {!isExecuting && hasError && !hasResult && (
            <StatusIndicator label="Error" icon={XCircle} tone="danger" />
          )}
        </ToolbarGroup>

        <TabsRoot>
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              onClick={() => setActiveResultsTab(tab.id)}
              active={activeResultsTab === tab.id}
            >
              {tab.label}
            </TabButton>
          ))}
        </TabsRoot>

        <div className="flex-1" />

        {hasResult && result && (
          <span className="text-xs text-muted-foreground">
            {result.rows.length} row{result.rows.length !== 1 ? "s" : ""}
            {" · "}
            {result.execution_time_ms.toFixed(0)}ms
          </span>
        )}

        {activeResultsTab === "data" && hasResult && (
          <div className="relative ml-2">
            <Search
              size={12}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search results..."
              className="w-48 pl-6"
              size="xs"
              aria-label="Search results"
            />
          </div>
        )}
      </Toolbar>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {isExecuting && <LoadingState label="Running query" />}

        {!isExecuting && hasError && !hasResult && <ErrorState message={error} />}

        {!isExecuting && !hasResult && !hasError && !hasExplain && (
          <EmptyState title="Run a query to see results (⌘+Enter)">
            <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground/60">
              <p>
                Tip: Use <InlineCode>{"{name:type}"}</InlineCode> for smart variables
              </p>
              <div className="flex flex-col gap-0.5 pl-4 font-mono text-[0.7rem]">
                <span>
                  <InlineCode>{"{status:text}"}</InlineCode> →{" "}
                  <span className="text-muted-foreground/40">'active'</span>
                </span>
                <span>
                  <InlineCode>{"{age:number}"}</InlineCode> →{" "}
                  <span className="text-muted-foreground/40">18</span>
                </span>
                <span>
                  <InlineCode>{"{active:boolean}"}</InlineCode> →{" "}
                  <span className="text-muted-foreground/40">TRUE</span>
                </span>
                <span>
                  <InlineCode>{"{start:date}"}</InlineCode> →{" "}
                  <span className="text-muted-foreground/40">'2024-01-15'</span>
                </span>
                <span>
                  <InlineCode>{"{ids:list}"}</InlineCode> →{" "}
                  <span className="text-muted-foreground/40">1, 2, 3</span>
                </span>
              </div>
              <p className="mt-0.5">
                Use <InlineCode>$variable</InlineCode> for direct string interpolation
              </p>
            </div>
          </EmptyState>
        )}

        {!isExecuting &&
          hasExplain &&
          !parsedPlan &&
          planParseError &&
          ["tree", "plan", "grid", "stats"].includes(activeResultsTab) && (
            <ErrorState message={`Failed to parse EXPLAIN output: ${planParseError}`} />
          )}

        {!isExecuting && hasExplain && parsedPlan && activeResultsTab === "tree" && (
          <PlanTree plan={parsedPlan} />
        )}

        {!isExecuting && hasExplain && parsedPlan && activeResultsTab === "plan" && (
          <PlanDiagram plan={parsedPlan} />
        )}

        {!isExecuting && hasExplain && parsedPlan && activeResultsTab === "grid" && (
          <PlanGrid plan={parsedPlan} />
        )}

        {!isExecuting && hasExplain && parsedPlan && activeResultsTab === "stats" && (
          <PlanStats plan={parsedPlan} />
        )}

        {!isExecuting && hasExplain && activeResultsTab === "raw" && (
          <div className="h-full">
            <MonacoEditor
              language={explainOutputKind === "json" ? "json" : "plaintext"}
              value={explainPlan}
              theme={resolvedTheme === "dark" ? "codb-dark" : "codb-light"}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 12,
                lineHeight: 18,
                padding: { top: 8 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                lineNumbers: "on",
                domReadOnly: true,
              }}
            />
          </div>
        )}

        {!isExecuting && activeResultsTab === "sql" && (hasResult || hasExplain) && (
          <div className="h-full">
            <MonacoEditor
              language="sql"
              value={activeTab?.explainQuery ?? activeTab?.executedSql ?? activeTab?.sql ?? ""}
              theme={resolvedTheme === "dark" ? "codb-dark" : "codb-light"}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 12,
                lineHeight: 18,
                padding: { top: 8 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                lineNumbers: "on",
                domReadOnly: true,
              }}
            />
          </div>
        )}

        {!isExecuting && hasResult && result && (
          <>
            {activeResultsTab === "data" && (
              <div className="flex h-full flex-col">
                <div className="flex-1 overflow-hidden">
                  <ResultsTable result={filteredResult ?? result} />
                </div>
              </div>
            )}

            {activeResultsTab === "details" && (
              <ResultDetailsRenderer result={result} resultShape={resultShape} />
            )}

            {activeResultsTab === "export" && (
              <div className="flex flex-col gap-4 p-4">
                <div className="flex items-start gap-3">
                  <ExportButton
                    icon={<Copy size={14} />}
                    label="Copy CSV"
                    onClick={handleCopyCsv}
                  />
                  <ExportButton
                    icon={<Copy size={14} />}
                    label="Copy JSON"
                    onClick={handleCopyJson}
                  />
                  <ExportButton
                    icon={<Download size={14} />}
                    label="Download CSV"
                    onClick={handleDownloadCsv}
                  />
                  <ExportButton
                    icon={<Download size={14} />}
                    label="Download JSON"
                    onClick={handleDownloadJson}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getResultDetailsTabLabel(resultShape: string): string {
  if (resultShape === "document") return "Document";
  if (resultShape === "scalar") return "Value";
  return "Payload";
}

function ResultDetailsRenderer({
  result,
  resultShape,
}: {
  result: QueryResult | null;
  resultShape: string;
}) {
  if (!result) return null;
  if (resultShape === "scalar") {
    return (
      <div className="h-full overflow-auto p-3">
        <CodeBlock className="whitespace-pre-wrap break-words">
          {String(result.data ?? result.rows[0]?.[0] ?? "")}
        </CodeBlock>
      </div>
    );
  }
  if (resultShape === "document") {
    return (
      <div className="h-full overflow-auto p-3">
        <CodeBlock className="whitespace-pre-wrap break-words">
          {JSON.stringify(result.data ?? result.rows, null, 2)}
        </CodeBlock>
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto p-3">
      <CodeBlock className="whitespace-pre-wrap break-words">
        {JSON.stringify(result.data ?? result.rows, null, 2)}
      </CodeBlock>
    </div>
  );
}

function ExportButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button onClick={onClick} disabled={disabled} size="md" leftIcon={icon}>
      {label}
    </Button>
  );
}
