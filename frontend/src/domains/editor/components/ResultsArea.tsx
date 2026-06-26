import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, Copy, Download, Search, ListTree } from "lucide-react";
import MonacoEditor from "@monaco-editor/react";
import { getDatabaseEngine } from "@/domains/connections/engine-registry";
import { useTheme } from "@/shared/contexts/theme-context";
import { useEditorContext } from "../hooks/editor-context";
import { ResultsTable } from "./ResultsTable";
import { PlanDiagram } from "./explain/PlanDiagram";
import { PlanTree } from "./explain/PlanTree";
import { PlanGrid } from "./explain/PlanGrid";
import { PlanStats } from "./explain/PlanStats";
import { parsePlan } from "../explain/plan-parser";
import type { Plan } from "../explain/types";
import {
  resultsToCsv,
  resultsToJson,
  copyToClipboard,
  downloadFile,
} from "../services/export-utils";

type ResultsTab = "sql" | "data" | "export" | "tree" | "plan" | "grid" | "stats" | "raw";

export function ResultsArea() {
  const { activeTab } = useEditorContext();
  const { resolvedTheme } = useTheme();
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>("data");
  const [searchQuery, setSearchQuery] = useState("");
  const engine = getDatabaseEngine(activeTab?.explainDbType ?? null);
  const explainOutputKind = engine.explain.outputKind;

  const result = activeTab?.result ?? null;
  const error = activeTab?.error ?? null;
  const explainPlan = activeTab?.explainPlan ?? null;
  const hasResult = result !== null;
  const hasError = error !== null;
  const hasExplain = explainPlan !== null;
  const isExecuting = activeTab?.isExecuting ?? false;

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
    [explainOutputKind, hasExplain],
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
      {/* Status bar + tabs */}
      <div className="flex h-8 flex-shrink-0 items-center border-b px-3">
        {/* Status badge */}
        <div className="flex items-center gap-1.5 pr-4">
          {isExecuting && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
          {!isExecuting && hasResult && (
            <>
              <CheckCircle2 size={12} className="text-foreground" />
              <span className="text-xs font-medium text-foreground">Success</span>
            </>
          )}
          {!isExecuting && hasExplain && !hasResult && !hasError && (
            <>
              <ListTree size={12} className="text-foreground" />
              <span className="text-xs font-medium text-foreground">Plan</span>
            </>
          )}
          {!isExecuting && hasError && !hasResult && (
            <>
              <XCircle size={12} className="text-destructive" />
              <span className="text-xs font-medium text-destructive">Error</span>
            </>
          )}
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveResultsTab(tab.id)}
              className={`h-8 text-xs transition-colors ${
                activeResultsTab === tab.id
                  ? "border-b-2 border-foreground font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Row count + timing */}
        {hasResult && result && (
          <span className="text-xs text-muted-foreground">
            {result.rows.length} row{result.rows.length !== 1 ? "s" : ""}
            {" · "}
            {result.execution_time_ms.toFixed(0)}ms
          </span>
        )}

        {/* Search input for data tab */}
        {activeResultsTab === "data" && hasResult && (
          <div className="relative ml-2">
            <Search
              size={12}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search results..."
              className="h-6 w-48 rounded border border-input bg-transparent pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {isExecuting && (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!isExecuting && hasError && !hasResult && (
          <div className="p-3">
            <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          </div>
        )}

        {!isExecuting && !hasResult && !hasError && !hasExplain && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-muted-foreground">Run a query to see results (⌘+Enter)</p>
            <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground/60">
              <p>
                Tip: Use{" "}
                <code className="rounded bg-muted px-1 font-mono text-[0.75rem]">
                  {"{name:type}"}
                </code>{" "}
                for smart variables
              </p>
              <div className="flex flex-col gap-0.5 pl-4 font-mono text-[0.7rem]">
                <span>
                  <code className="rounded bg-muted px-1">{"{status:text}"}</code> →{" "}
                  <span className="text-muted-foreground/40">'active'</span>
                </span>
                <span>
                  <code className="rounded bg-muted px-1">{"{age:number}"}</code> →{" "}
                  <span className="text-muted-foreground/40">18</span>
                </span>
                <span>
                  <code className="rounded bg-muted px-1">{"{active:boolean}"}</code> →{" "}
                  <span className="text-muted-foreground/40">TRUE</span>
                </span>
                <span>
                  <code className="rounded bg-muted px-1">{"{start:date}"}</code> →{" "}
                  <span className="text-muted-foreground/40">'2024-01-15'</span>
                </span>
                <span>
                  <code className="rounded bg-muted px-1">{"{ids:list}"}</code> →{" "}
                  <span className="text-muted-foreground/40">1, 2, 3</span>
                </span>
              </div>
              <p className="mt-0.5">
                Use{" "}
                <code className="rounded bg-muted px-1 font-mono text-[0.75rem]">$variable</code>{" "}
                for direct string interpolation
              </p>
            </div>
          </div>
        )}

        {!isExecuting &&
          hasExplain &&
          !parsedPlan &&
          planParseError &&
          ["tree", "plan", "grid", "stats"].includes(activeResultsTab) && (
            <div className="p-3">
              <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Failed to parse EXPLAIN output: {planParseError}
              </div>
            </div>
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
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded border border-input px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
