import { useMemo } from "react";
import type { Plan, PlanNode } from "../../explain/types";
import { durationSeverity, severityClasses } from "../../explain/color";
import { formatDuration, formatPercent } from "../../explain/format";

interface StatsGroup {
  name: string;
  count: number;
  totalDuration: number;
  durationPercent: number;
  nodes: PlanNode[];
}

export function PlanStats({ plan }: { plan: Plan }) {
  const byNodeType = useMemo(() => groupBy(plan, "Node Type"), [plan]);
  const byTable = useMemo(() => groupBy(plan, "Relation Name"), [plan]);
  const byIndex = useMemo(() => groupBy(plan, "Index Name"), [plan]);

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <div className="grid grid-cols-2 gap-4">
        <StatsCard title="By Node Type" groups={byNodeType} plan={plan} />
        {byTable.length > 0 && <StatsCard title="By Table" groups={byTable} plan={plan} />}
        {byIndex.length > 0 && <StatsCard title="By Index" groups={byIndex} plan={plan} />}
      </div>
    </div>
  );
}

function groupBy(plan: Plan, field: string): StatsGroup[] {
  const map = new Map<string, PlanNode[]>();
  for (const node of plan.flatNodes) {
    const key = node[field] as string | undefined;
    if (!key) continue;
    const existing = map.get(key);
    if (existing) existing.push(node);
    else map.set(key, [node]);
  }

  const groups: StatsGroup[] = [];
  for (const [name, nodes] of map) {
    const totalDuration = nodes.reduce((sum, n) => sum + n.exclusiveDuration, 0);
    groups.push({
      name,
      count: nodes.length,
      totalDuration,
      durationPercent: plan.executionTime > 0 ? (totalDuration / plan.executionTime) * 100 : 0,
      nodes,
    });
  }

  return groups.sort((a, b) => b.totalDuration - a.totalDuration);
}

function StatsCard({
  title,
  groups,
  plan,
}: {
  title: string;
  groups: StatsGroup[];
  plan: Plan;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      <table className="w-full table-fixed text-[11px]">
        <thead>
          <tr className="border-b text-left text-[0.75rem] font-medium uppercase tracking-wider text-muted-foreground/70">
            <th className="px-3 py-1.5">Name</th>
            <th className="px-3 py-1.5 text-right">Count</th>
            {plan.isAnalyze && <th className="px-3 py-1.5 text-right">Time</th>}
            {plan.isAnalyze && <th className="px-3 py-1.5 text-right">% Total</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const ds = durationSeverity(g.durationPercent);
            return (
              <tr key={g.name} className="border-b border-border/30 hover:bg-accent/20">
                <td className="px-3 py-1.5 font-medium text-foreground max-w-[200px] truncate">
                  {g.name}
                  {title === "By Table" && g.nodes[0]?.["Schema"] && (
                    <span className="ml-1 text-muted-foreground font-normal">
                      ({g.nodes[0]["Schema"] as string})
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {g.count}
                </td>
                {plan.isAnalyze && (
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatDuration(g.totalDuration)}
                  </td>
                )}
                {plan.isAnalyze && (
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {ds ? (
                      <span
                        className={`rounded px-1 py-px text-[0.75rem] font-medium ${severityClasses[ds]}`}
                      >
                        {formatPercent(g.durationPercent)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {formatPercent(g.durationPercent)}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
