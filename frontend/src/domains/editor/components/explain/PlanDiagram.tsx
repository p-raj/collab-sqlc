import { useMemo, useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Clock, ArrowUp, ArrowDown } from "lucide-react";
import type { Plan, PlanNode } from "../../explain/types";
import { percentToColor, durationSeverity, estimateSeverity, rowsRemovedSeverity, severityClasses } from "../../explain/color";
import { formatDuration, formatRows, formatCost, formatPercent, getNodeName, getNodeRelation } from "../../explain/format";
import { type Metric, ALL_METRICS, computeBar, metricAvailable } from "../../explain/metrics";

export function PlanDiagram({ plan }: { plan: Plan }) {
  const [metric, setMetric] = useState<Metric>("time");
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  const toggleNode = useCallback((nodeId: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">Color by</span>
        {ALL_METRICS.filter((m) => metricAvailable(plan, m)).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`rounded px-2 py-0.5 text-[11px] capitalize transition-colors ${metric === m
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
          >
            {m}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
          {plan.isAnalyze && (
            <>
              <span>
                Execution{" "}
                <span className="font-medium text-foreground">
                  {formatDuration(plan.executionTime)}
                </span>
              </span>
              <span>
                Planning{" "}
                <span className="font-medium text-foreground">
                  {formatDuration(plan.planningTime)}
                </span>
              </span>
            </>
          )}
          <span>
            {plan.totalNodes} node{plan.totalNodes !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <tbody>
            {plan.flatNodes.map((node) => (
              <DiagramRow
                key={node.nodeId}
                node={node}
                plan={plan}
                metric={metric}
                isExpanded={expandedNodes.has(node.nodeId)}
                onToggle={() => toggleNode(node.nodeId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiagramRow({
  node,
  plan,
  metric,
  isExpanded,
  onToggle,
}: {
  node: PlanNode;
  plan: Plan;
  metric: Metric;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const name = getNodeName(node);
  const relation = getNodeRelation(node);

  const bar = useMemo(() => computeBar(node, plan, metric), [metric, node, plan]);

  const barColor = percentToColor(bar.percent);

  const badges = useMemo(() => {
    const result: Array<{ label: string; severity: 2 | 3 | 4 }> = [];
    const ds = durationSeverity(node.durationPercent);
    if (ds) result.push({ label: `${formatPercent(node.durationPercent)} time`, severity: ds });
    const es = estimateSeverity(node.estimateFactor);
    if (es)
      result.push({
        label: `${node.estimateFactor.toFixed(0)}× ${node.estimateDirection}`,
        severity: es,
      });
    const actualRows = (node["Actual Rows"] as number) ?? 0;
    const rowsRemovedByFilter = (node["Rows Removed by Filter"] as number) ?? 0;
    const totalRows = actualRows + rowsRemovedByFilter;
    if (totalRows > 0) {
      const removedPct = (rowsRemovedByFilter / totalRows) * 100;
      const rs = rowsRemovedSeverity(removedPct);
      if (rs) result.push({ label: `${formatPercent(removedPct)} filtered`, severity: rs });
    }
    return result;
  }, [node]);

  return (
    <>
      <tr
        onClick={onToggle}
        className="group cursor-pointer border-b border-border/40 transition-colors hover:bg-accent/30"
      >
        {/* Node ID */}
        <td className="w-8 py-1.5 pl-2 pr-1 text-right align-top text-[0.75rem] tabular-nums text-muted-foreground/40">
          {node.nodeId}
        </td>

        {/* Tree + Name */}
        <td className="py-1.5 pl-0 pr-2 align-top">
          <div className="flex items-start" style={{ paddingLeft: node.depth * 20 }}>
            <TreeLines node={node} />
            <span className="mr-1 mt-px text-muted-foreground/50">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-xs text-foreground whitespace-nowrap">
                  {name}
                </span>
                {relation && (
                  <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                    {relation}
                  </span>
                )}
                {badges.map((b, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center rounded px-1 py-px text-[9px] font-medium ${severityClasses[b.severity]}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
              {node["Filter"] && (
                <div className="mt-0.5 text-[0.75rem] font-mono text-muted-foreground/70 truncate max-w-md">
                  Filter: {node["Filter"] as string}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Bar */}
        <td className="w-[30%] px-2 py-1.5 align-top">
          <div className="relative mt-0.5 h-5 w-full overflow-hidden rounded bg-muted/30">
            <div
              className="absolute inset-y-0 left-0 rounded transition-all duration-200"
              style={{
                width: `${Math.max(bar.percent, 0.5)}%`,
                backgroundColor: barColor,
                opacity: 0.65,
              }}
            />
            <span className="relative z-10 flex h-full items-center px-2 text-[0.75rem] font-medium tabular-nums text-foreground">
              {bar.label}
              {metric === "time" && node.durationPercent > 1 && (
                <span className="ml-1 text-muted-foreground/70">
                  ({formatPercent(node.durationPercent)})
                </span>
              )}
            </span>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b border-border/40">
          <td />
          <td colSpan={2} className="pb-3 pl-4 pr-4 pt-1">
            <NodeDetail node={node} plan={plan} />
          </td>
        </tr>
      )}
    </>
  );
}

function TreeLines({ node }: { node: PlanNode }) {
  if (node.depth === 0) return null;
  const parts: string[] = [];
  for (let i = 1; i < node.depth; i++) {
    parts.push(node.ancestors[i] ? "   " : "│  ");
  }
  parts.push(node.isLastChild ? "└─ " : "├─ ");
  return (
    <span className="mr-0.5 font-mono text-[11px] leading-none text-muted-foreground/30 select-none whitespace-pre">
      {parts.join("")}
    </span>
  );
}

function NodeDetail({ node, plan }: { node: PlanNode; plan: Plan }) {
  const loops = (node["Actual Loops"] as number) ?? 1;
  const hasBuffers =
    ((node["Shared Hit Blocks"] as number) ?? 0) > 0 ||
    ((node["Shared Read Blocks"] as number) ?? 0) > 0;

  return (
    <div
      className="grid gap-x-8 gap-y-2 text-[11px]"
      style={{ paddingLeft: node.depth * 20 + 32, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
    >
      {/* Timing */}
      {plan.isAnalyze && (
        <DetailSection title="Timing" icon={<Clock size={10} />}>
          <DetailRow label="Exclusive" value={formatDuration(node.exclusiveDuration)} />
          <DetailRow
            label="Total"
            value={formatDuration(((node["Actual Total Time"] as number) ?? 0) * loops)}
          />
          <DetailRow label="% of query" value={formatPercent(node.durationPercent)} />
          {loops > 1 && <DetailRow label="Loops" value={loops.toString()} />}
        </DetailSection>
      )}

      {/* Rows */}
      <DetailSection title="Rows">
        <DetailRow label="Actual" value={formatRows(node.actualRowsRevised)} />
        <DetailRow label="Planned" value={formatRows((node["Plan Rows"] as number) ?? 0)} />
        {node.estimateDirection !== "none" && (
          <DetailRow
            label="Estimate"
            value={
              <span className="inline-flex items-center gap-0.5">
                {node.estimateDirection === "under" ? (
                  <ArrowUp size={9} className="text-orange-500" />
                ) : (
                  <ArrowDown size={9} className="text-blue-500" />
                )}
                {node.estimateFactor.toFixed(1)}×{" "}
                {node.estimateDirection === "under" ? "under" : "over"}
              </span>
            }
          />
        )}
        {(node["Rows Removed by Filter"] as number) > 0 && (
          <DetailRow
            label="Removed by filter"
            value={formatRows((node["Rows Removed by Filter"] as number) ?? 0)}
          />
        )}
      </DetailSection>

      {/* Cost */}
      <DetailSection title="Cost">
        <DetailRow label="Exclusive" value={formatCost(node.exclusiveCost)} />
        <DetailRow label="Total" value={formatCost((node["Total Cost"] as number) ?? 0)} />
        <DetailRow label="Startup" value={formatCost((node["Startup Cost"] as number) ?? 0)} />
      </DetailSection>

      {/* Buffers */}
      {hasBuffers && (
        <DetailSection title="Buffers">
          {((node["Shared Hit Blocks"] as number) ?? 0) > 0 && (
            <DetailRow label="Shared hit" value={((node["Shared Hit Blocks"] as number) ?? 0).toLocaleString()} />
          )}
          {((node["Shared Read Blocks"] as number) ?? 0) > 0 && (
            <DetailRow label="Shared read" value={((node["Shared Read Blocks"] as number) ?? 0).toLocaleString()} />
          )}
          {((node["Shared Dirtied Blocks"] as number) ?? 0) > 0 && (
            <DetailRow label="Shared dirtied" value={((node["Shared Dirtied Blocks"] as number) ?? 0).toLocaleString()} />
          )}
          {((node["Shared Written Blocks"] as number) ?? 0) > 0 && (
            <DetailRow label="Shared written" value={((node["Shared Written Blocks"] as number) ?? 0).toLocaleString()} />
          )}
        </DetailSection>
      )}

      {/* Info */}
      {(node["Index Name"] || node["Hash Cond"] || node["Sort Key"] || node["Group Key"]) && (
        <DetailSection title="Info">
          {node["Index Name"] && (
            <DetailRow label="Index" value={node["Index Name"] as string} />
          )}
          {node["Hash Cond"] && (
            <DetailRow label="Hash cond" value={<code className="text-[0.75rem]">{node["Hash Cond"] as string}</code>} />
          )}
          {node["Sort Key"] && (
            <DetailRow label="Sort key" value={(node["Sort Key"] as string[]).join(", ")} />
          )}
          {node["Sort Method"] && (
            <DetailRow label="Sort method" value={`${node["Sort Method"]} (${node["Sort Space Used"]}kB ${node["Sort Space Type"]})`} />
          )}
          {node["Group Key"] && (
            <DetailRow label="Group key" value={(node["Group Key"] as string[]).join(", ")} />
          )}
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[0.75rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {icon}
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}
