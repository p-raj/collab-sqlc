import { useMemo } from "react";
import type { Plan, PlanNode } from "../../explain/types";
import { percentToColor, durationSeverity, estimateSeverity, severityClasses } from "../../explain/color";
import { formatDuration, formatRows, formatCost, formatPercent, getNodeName, getNodeRelation, formatBlocks } from "../../explain/format";

export function PlanGrid({ plan }: { plan: Plan }) {
  const hasBuffers = useMemo(
    () =>
      plan.flatNodes.some(
        (n) =>
          ((n["Shared Hit Blocks"] as number) ?? 0) > 0 ||
          ((n["Shared Read Blocks"] as number) ?? 0) > 0,
      ),
    [plan],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-[0.75rem] font-medium uppercase tracking-wider text-muted-foreground/70">
              <th className="px-2 py-2 w-8">#</th>
              <th className="px-2 py-2">Node</th>
              {plan.isAnalyze && <th className="px-2 py-2 text-right whitespace-nowrap">Time</th>}
              {plan.isAnalyze && <th className="px-2 py-2 text-right whitespace-nowrap">% Total</th>}
              <th className="px-2 py-2 text-right">Rows</th>
              {plan.isAnalyze && <th className="px-2 py-2 text-right whitespace-nowrap">Est.</th>}
              <th className="px-2 py-2 text-right">Cost</th>
              {plan.isAnalyze && <th className="px-2 py-2 text-right">Loops</th>}
              {hasBuffers && <th className="px-2 py-2 text-right whitespace-nowrap">Shared Hit</th>}
              {hasBuffers && <th className="px-2 py-2 text-right whitespace-nowrap">Shared Read</th>}
            </tr>
          </thead>
          <tbody>
            {plan.flatNodes.map((node) => (
              <GridRow key={node.nodeId} node={node} plan={plan} hasBuffers={hasBuffers} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GridRow({
  node,
  plan,
  hasBuffers,
}: {
  node: PlanNode;
  plan: Plan;
  hasBuffers: boolean;
}) {
  const name = getNodeName(node);
  const relation = getNodeRelation(node);
  const ds = durationSeverity(node.durationPercent);
  const es = estimateSeverity(node.estimateFactor);

  const durationBarPct =
    plan.maxDuration > 0 ? (node.exclusiveDuration / plan.maxDuration) * 100 : 0;

  return (
    <tr className="border-b border-border/30 transition-colors hover:bg-accent/20">
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground/40">
        {node.nodeId}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center" style={{ paddingLeft: node.depth * 16 }}>
          <GridTreeLines node={node} />
          <span className="font-medium text-foreground">{name}</span>
          {relation && (
            <span className="ml-1.5 font-mono text-muted-foreground">{relation}</span>
          )}
        </div>
      </td>

      {plan.isAnalyze && (
        <td className="px-2 py-1.5 text-right tabular-nums">
          <div className="relative">
            <div
              className="absolute inset-y-0 right-0 rounded-sm opacity-15"
              style={{
                width: `${durationBarPct}%`,
                backgroundColor: percentToColor(durationBarPct),
              }}
            />
            <span className="relative">{formatDuration(node.exclusiveDuration)}</span>
          </div>
        </td>
      )}

      {plan.isAnalyze && (
        <td className="px-2 py-1.5 text-right tabular-nums">
          {ds ? (
            <span className={`rounded px-1 py-px text-[0.75rem] font-medium ${severityClasses[ds]}`}>
              {formatPercent(node.durationPercent)}
            </span>
          ) : (
            <span className="text-muted-foreground">{formatPercent(node.durationPercent)}</span>
          )}
        </td>
      )}

      <td className="px-2 py-1.5 text-right tabular-nums">
        {formatRows(node.actualRowsRevised || ((node["Plan Rows"] as number) ?? 0))}
      </td>

      {plan.isAnalyze && (
        <td className="px-2 py-1.5 text-right tabular-nums">
          {es ? (
            <span className={`rounded px-1 py-px text-[0.75rem] font-medium ${severityClasses[es]}`}>
              {node.estimateFactor.toFixed(0)}×
            </span>
          ) : node.estimateDirection !== "none" ? (
            <span className="text-muted-foreground">
              {node.estimateFactor.toFixed(1)}×
            </span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
      )}

      <td className="px-2 py-1.5 text-right tabular-nums">{formatCost(node.exclusiveCost)}</td>

      {plan.isAnalyze && (
        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
          {(node["Actual Loops"] as number) ?? 1}
        </td>
      )}

      {hasBuffers && (
        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
          {((node["Shared Hit Blocks"] as number) ?? 0) > 0
            ? formatBlocks((node["Shared Hit Blocks"] as number) ?? 0)
            : "—"}
        </td>
      )}
      {hasBuffers && (
        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
          {((node["Shared Read Blocks"] as number) ?? 0) > 0
            ? formatBlocks((node["Shared Read Blocks"] as number) ?? 0)
            : "—"}
        </td>
      )}
    </tr>
  );
}

function GridTreeLines({ node }: { node: PlanNode }) {
  if (node.depth === 0) return null;
  const parts: string[] = [];
  for (let i = 1; i < node.depth; i++) {
    parts.push(node.ancestors[i] ? "   " : "│  ");
  }
  parts.push(node.isLastChild ? "└─ " : "├─ ");
  return (
    <span className="mr-1 font-mono text-[0.75rem] leading-none text-muted-foreground/30 select-none whitespace-pre">
      {parts.join("")}
    </span>
  );
}
