import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  Maximize2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Filter as FilterIcon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { IconButton } from "@/shared/components/ui/IconButton";
import { TabButton, TabsRoot } from "@/shared/components/ui/Tabs";
import type { Plan, PlanNode } from "../../explain/types";
import {
  percentToColor,
  durationSeverity,
  estimateSeverity,
  severityClasses,
} from "../../explain/color";
import {
  formatDuration,
  formatRows,
  formatCost,
  formatPercent,
  formatBlocks,
  getNodeName,
  getNodeRelation,
} from "../../explain/format";
import { type Metric, computeBar } from "../../explain/metrics";
import { MetricSelector } from "./MetricSelector";

const NODE_W = 300;
const NODE_H = 80;
const GAP_H = 32;
const GAP_V = 60;

// --- Layout types ---

interface LayoutNode {
  node: PlanNode;
  x: number;
  y: number;
  subtreeWidth: number;
  children: LayoutNode[];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type DetailTab = "general" | "io" | "output" | "workers" | "misc";

// --- Component ---

export function PlanTree({ plan }: { plan: Plan }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [metric, setMetric] = useState<Metric>("time");
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const layout = useMemo(() => computeLayout(plan.root), [plan]);
  const bounds = useMemo(() => getBounds(layout), [layout]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const treeW = bounds.maxX - bounds.minX;
    const treeH = bounds.maxY - bounds.minY;
    const pad = 40;
    const scaleX = (rect.width - pad * 2) / treeW;
    const scaleY = (rect.height - pad * 2) / treeH;
    const scale = Math.min(scaleX, scaleY, 1);
    const x = (rect.width - treeW * scale) / 2 - bounds.minX * scale;
    setTransform({ x, y: pad, scale });
  }, [bounds]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setTransform((prev) => {
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.max(0.05, Math.min(4, prev.scale * factor));
      const dx = mouseX - prev.x;
      const dy = mouseY - prev.y;
      return {
        x: mouseX - dx * (newScale / prev.scale),
        y: mouseY - dy * (newScale / prev.scale),
        scale: newScale,
      };
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-tree-node]")) return;
    isPanning.current = true;
    const t = transformRef.current;
    panStart.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setTransform({
      x: panStart.current.tx + (e.clientX - panStart.current.x),
      y: panStart.current.ty + (e.clientY - panStart.current.y),
      scale: transformRef.current.scale,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const toggleNode = useCallback((nodeId: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const canvasW = bounds.maxX + 100;
  const canvasH = bounds.maxY + 100;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Controls */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <MetricSelector plan={plan} value={metric} onChange={setMetric} />

        <span className="mx-1 text-border">|</span>
        <span className="text-[11px] text-muted-foreground">
          {plan.totalNodes} node{plan.totalNodes !== 1 ? "s" : ""}
        </span>
        {plan.isAnalyze && (
          <span className="text-[11px] text-muted-foreground">
            · {formatDuration(plan.executionTime)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 text-[11px]">
          <Button
            variant="ghost"
            size="xs"
            aria-label="Zoom in"
            onClick={() => setTransform((p) => ({ ...p, scale: Math.min(4, p.scale * 1.25) }))}
          >
            +
          </Button>
          <span className="w-10 text-center tabular-nums text-muted-foreground">
            {Math.round(transform.scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="xs"
            aria-label="Zoom out"
            onClick={() => setTransform((p) => ({ ...p, scale: Math.max(0.05, p.scale * 0.8) }))}
          >
            −
          </Button>
          <IconButton
            aria-label="Fit plan to view"
            onClick={fitToView}
            size="xs"
            icon={<Maximize2 size={10} />}
            title="Fit"
          />
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
            position: "relative",
            width: canvasW,
            height: canvasH,
          }}
        >
          {/* Edges — thick pipes proportional to rows */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={canvasW}
            height={canvasH}
            style={{ overflow: "visible" }}
          >
            {edges.map(({ parent, child }, i) => {
              const x1 = parent.x + NODE_W / 2;
              const y1 = parent.y + NODE_H;
              const x2 = child.x + NODE_W / 2;
              const y2 = child.y;
              const cy1 = y1 + GAP_V * 0.4;
              const cy2 = y2 - GAP_V * 0.4;
              const rowRatio = plan.maxRows > 0 ? child.node.actualRowsRevised / plan.maxRows : 0;
              // Thick pipe: 2px min, 28px max
              const sw = Math.max(2, Math.min(28, rowRatio * 26 + 2));
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="currentColor"
                  className="text-muted-foreground/20"
                  strokeWidth={sw}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {allNodes.map((ln) => (
            <TreeNodeCard
              key={ln.node.nodeId}
              ln={ln}
              plan={plan}
              metric={metric}
              isExpanded={expandedNodes.has(ln.node.nodeId)}
              onToggle={() => toggleNode(ln.node.nodeId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Severity badges for collapsed cards ---

function SeverityBadges({ node, plan }: { node: PlanNode; plan: Plan }) {
  const ds = durationSeverity(node.durationPercent);
  const es = estimateSeverity(node.estimateFactor);
  const rowsRemoved =
    ((node["Rows Removed by Filter"] as number) ?? 0) +
    ((node["Rows Removed by Join Filter"] as number) ?? 0);
  const actualRows = (node["Actual Rows"] as number) ?? 0;
  const hasRowsRemoved =
    rowsRemoved > 0 && actualRows > 0 && rowsRemoved / (rowsRemoved + actualRows) > 0.5;
  const hasCostWarning = plan.maxCost > 0 && node.exclusiveCost / plan.maxCost > 0.4;

  if (!ds && !es && !hasRowsRemoved && !hasCostWarning) return null;

  return (
    <div className="flex items-center gap-1">
      {ds && (
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.75rem] ${severityClasses[ds]}`}
          title={`Timing: ${formatPercent(node.durationPercent)}`}
        >
          <Clock size={11} />
        </span>
      )}
      {hasCostWarning && (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warning/15 text-warning text-[0.75rem]"
          title={`Cost: ${formatCost(node.exclusiveCost)}`}
        >
          <DollarSign size={11} />
        </span>
      )}
      {hasRowsRemoved && (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive/15 text-destructive text-[0.75rem]"
          title={`Rows removed: ${formatRows(rowsRemoved)}`}
        >
          <FilterIcon size={11} />
        </span>
      )}
    </div>
  );
}

// --- Node Card ---

function TreeNodeCard({
  ln,
  plan,
  metric,
  isExpanded,
  onToggle,
}: {
  ln: LayoutNode;
  plan: Plan;
  metric: Metric;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { node } = ln;
  const [detailTab, setDetailTab] = useState<DetailTab>("general");
  const name = getNodeName(node);
  const relation = getNodeRelation(node);
  const bar = computeBar(node, plan, metric);
  const barColor = percentToColor(bar.percent);
  const neverExecuted = plan.isAnalyze && (node["Actual Loops"] as number) === 0;

  const relationLabel = relation
    ? node["Node Type"]?.includes("Scan") || node["Node Type"]?.includes("Index")
      ? "on "
      : "by "
    : null;

  return (
    <div
      data-tree-node
      className={`absolute cursor-pointer rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md hover:ring-1 hover:ring-ring/30 ${
        neverExecuted ? "opacity-40" : ""
      }`}
      style={{
        left: ln.x,
        top: ln.y,
        width: NODE_W,
        minHeight: NODE_H,
        zIndex: isExpanded ? 20 : 1,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {/* Header */}
      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {isExpanded ? (
              <ChevronUp size={14} className="flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown size={14} className="flex-shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold leading-tight text-foreground">
                {name}
              </div>
              {relation && (
                <div className="mt-0.5 truncate text-[0.75rem] font-mono text-muted-foreground">
                  {relationLabel}
                  {relation}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!isExpanded && <SeverityBadges node={node} plan={plan} />}
            <span className="text-[9px] tabular-nums text-primary/50 font-medium">
              #{node.nodeId}
            </span>
          </div>
        </div>

        {/* Collapsed: compact bar + metric label */}
        {!isExpanded && (
          <div className="mt-1.5">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(bar.percent, 1)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t" onClick={(e) => e.stopPropagation()}>
          {/* Description */}
          <div className="px-3 pt-2 pb-1.5 text-[0.75rem] text-muted-foreground italic leading-snug">
            <span className="not-italic font-semibold text-foreground/80">{node["Node Type"]}</span>{" "}
            {getNodeDescription(node)}
          </div>

          {/* Detail tabs */}
          <TabsRoot className="gap-0 border-b px-3">
            {detailTabs(node).map(({ key, label, available }) =>
              available ? (
                <TabButton
                  key={key}
                  onClick={() => setDetailTab(key)}
                  active={detailTab === key}
                  className={`h-auto border-b-2 px-2.5 py-1 text-[0.75rem] ${
                    detailTab === key ? "" : "border-transparent"
                  }`}
                >
                  {label}
                </TabButton>
              ) : null,
            )}
          </TabsRoot>

          {/* Tab content */}
          <div className="px-3 py-2 space-y-1.5 text-[0.75rem]">
            {detailTab === "general" && <GeneralTab node={node} plan={plan} />}
            {detailTab === "io" && <IoBuffersTab node={node} />}
            {detailTab === "output" && <OutputTab node={node} />}
            {detailTab === "workers" && <WorkersTab node={node} />}
            {detailTab === "misc" && <MiscTab node={node} />}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Detail tab definitions ---

function detailTabs(node: PlanNode): Array<{ key: DetailTab; label: string; available: boolean }> {
  const hasIo =
    ((node["Shared Hit Blocks"] as number) ?? 0) > 0 ||
    ((node["Shared Read Blocks"] as number) ?? 0) > 0 ||
    ((node["I/O Read Time"] as number) ?? 0) > 0;
  const hasOutput = ((node["Output"] as string[]) ?? []).length > 0;
  const hasWorkers =
    ((node["Workers Planned"] as number) ?? 0) > 0 ||
    ((node["Workers"] as unknown[]) ?? []).length > 0;
  const hasMisc =
    !!node["Filter"] ||
    !!node["Sort Key"] ||
    !!node["Hash Cond"] ||
    !!node["Index Cond"] ||
    !!node["Join Filter"] ||
    !!node["Group Key"] ||
    !!node["Subplan Name"] ||
    !!node["CTE Name"];

  return [
    { key: "general" as DetailTab, label: "General", available: true },
    { key: "io" as DetailTab, label: "IO & Buffers", available: hasIo },
    { key: "output" as DetailTab, label: "Output", available: hasOutput },
    { key: "workers" as DetailTab, label: "Workers", available: hasWorkers },
    { key: "misc" as DetailTab, label: "Misc", available: hasMisc },
  ];
}

// --- Tab content components ---

function GeneralTab({ node, plan }: { node: PlanNode; plan: Plan }) {
  const totalCost = (node["Total Cost"] as number) ?? 0;
  const plannedRows = (node["Plan Rows"] as number) ?? 0;

  return (
    <>
      {plan.isAnalyze && (
        <MetricRow
          icon={<Clock size={11} />}
          label="Timing"
          value={formatDuration(node.exclusiveDuration)}
          secondary={`${formatPercent(node.durationPercent)}`}
          severity={durationSeverity(node.durationPercent)}
        />
      )}
      <MetricRow
        icon={<span className="text-[0.75rem]">≡</span>}
        label="Rows"
        value={formatRows(node.actualRowsRevised)}
        secondary={`(Planned: ${formatRows(plannedRows)})`}
        severity={estimateSeverity(node.estimateFactor)}
      />
      <MetricRow
        icon={<DollarSign size={11} />}
        label="Cost"
        value={formatCost(node.exclusiveCost)}
        secondary={`(Total: ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })})`}
      />
    </>
  );
}

function IoBuffersTab({ node }: { node: PlanNode }) {
  const sharedHit = (node["Shared Hit Blocks"] as number) ?? 0;
  const sharedRead = (node["Shared Read Blocks"] as number) ?? 0;
  const sharedDirtied = (node["Shared Dirtied Blocks"] as number) ?? 0;
  const sharedWritten = (node["Shared Written Blocks"] as number) ?? 0;
  const tempRead = (node["Temp Read Blocks"] as number) ?? 0;
  const tempWritten = (node["Temp Written Blocks"] as number) ?? 0;
  const ioReadTime = (node["I/O Read Time"] as number) ?? 0;
  const ioWriteTime = (node["I/O Write Time"] as number) ?? 0;

  return (
    <div className="space-y-1">
      {sharedHit > 0 && <DLine label="Shared Hit" value={formatBlocks(sharedHit)} />}
      {sharedRead > 0 && <DLine label="Shared Read" value={formatBlocks(sharedRead)} />}
      {sharedDirtied > 0 && <DLine label="Shared Dirtied" value={formatBlocks(sharedDirtied)} />}
      {sharedWritten > 0 && <DLine label="Shared Written" value={formatBlocks(sharedWritten)} />}
      {tempRead > 0 && <DLine label="Temp Read" value={formatBlocks(tempRead)} />}
      {tempWritten > 0 && <DLine label="Temp Written" value={formatBlocks(tempWritten)} />}
      {ioReadTime > 0 && <DLine label="I/O Read Time" value={formatDuration(ioReadTime)} />}
      {ioWriteTime > 0 && <DLine label="I/O Write Time" value={formatDuration(ioWriteTime)} />}
    </div>
  );
}

function OutputTab({ node }: { node: PlanNode }) {
  const output = (node["Output"] as string[]) ?? [];
  if (output.length === 0) return <span className="text-muted-foreground">No output columns</span>;
  return (
    <div className="space-y-0.5">
      {output.map((col, i) => (
        <div key={i} className="font-mono text-[0.75rem] text-foreground/80 truncate">
          {col}
        </div>
      ))}
    </div>
  );
}

function WorkersTab({ node }: { node: PlanNode }) {
  const planned = (node["Workers Planned"] as number) ?? 0;
  const launched = (node["Workers Launched"] as number) ?? 0;
  return (
    <div className="space-y-1">
      {planned > 0 && <DLine label="Workers Planned" value={planned.toString()} />}
      {launched > 0 && <DLine label="Workers Launched" value={launched.toString()} />}
    </div>
  );
}

function MiscTab({ node }: { node: PlanNode }) {
  return (
    <div className="space-y-1">
      {node["Filter"] && <DLine label="Filter" value={node["Filter"] as string} />}
      {node["Join Filter"] && <DLine label="Join Filter" value={node["Join Filter"] as string} />}
      {node["Index Cond"] && <DLine label="Index Cond" value={node["Index Cond"] as string} />}
      {node["Index Name"] && <DLine label="Index" value={node["Index Name"] as string} />}
      {node["Hash Cond"] && <DLine label="Hash Cond" value={node["Hash Cond"] as string} />}
      {node["Sort Key"] && (
        <DLine label="Sort Key" value={(node["Sort Key"] as string[]).join(", ")} />
      )}
      {node["Sort Method"] && <DLine label="Sort Method" value={node["Sort Method"] as string} />}
      {node["Sort Space Used"] != null && (
        <DLine
          label="Sort Space"
          value={`${node["Sort Space Used"]}kB (${node["Sort Space Type"]})`}
        />
      )}
      {node["Group Key"] && (
        <DLine label="Group Key" value={(node["Group Key"] as string[]).join(", ")} />
      )}
      {node["Peak Memory Usage"] != null && (
        <DLine label="Peak Memory" value={`${node["Peak Memory Usage"]}kB`} />
      )}
      {node["Hash Buckets"] != null && (
        <DLine label="Hash Buckets" value={(node["Hash Buckets"] as number).toLocaleString()} />
      )}
      {node["Hash Batches"] != null && (
        <DLine label="Hash Batches" value={(node["Hash Batches"] as number).toString()} />
      )}
      {node["CTE Name"] && <DLine label="CTE" value={node["CTE Name"] as string} />}
      {node["Subplan Name"] && <DLine label="Subplan" value={node["Subplan Name"] as string} />}
      {node["Rows Removed by Filter"] != null && (
        <DLine label="Rows Removed" value={formatRows(node["Rows Removed by Filter"] as number)} />
      )}
    </div>
  );
}

// --- Metric row with icon ---

function MetricRow({
  icon,
  label,
  value,
  secondary,
  severity,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
  severity?: 2 | 3 | 4 | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex-shrink-0 ${severity ? severityClasses[severity] : "text-muted-foreground/70"}`}
      >
        {icon}
      </span>
      <span className="text-muted-foreground/70 w-12 flex-shrink-0">{label}:</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      {secondary && <span className="text-muted-foreground/60 tabular-nums">{secondary}</span>}
    </div>
  );
}

function DLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0 text-muted-foreground/70 w-24">{label}</span>
      <span className="font-mono text-foreground/80 break-all">{value}</span>
    </div>
  );
}

// --- Node descriptions ---

function getNodeDescription(node: PlanNode): string {
  const descriptions: Record<string, string> = {
    "Seq Scan": "sequentially scans every row in the table.",
    "Index Scan": "uses an index to find matching rows, then fetches them from the table.",
    "Index Only Scan": "uses an index to return results without accessing the table.",
    "Bitmap Heap Scan": "fetches rows from pages identified by a bitmap index scan.",
    "Bitmap Index Scan": "scans an index to build a bitmap of matching pages.",
    "Nested Loop": "joins two inputs by iterating through the inner for each outer row.",
    "Hash Join": "joins by building a hash table on one input and probing it with the other.",
    "Merge Join": "joins two pre-sorted inputs by merging them together.",
    Sort: "sorts rows according to the specified key(s).",
    Aggregate: "computes aggregate functions (SUM, COUNT, etc.) over grouped rows.",
    GroupAggregate: "computes aggregates for each group of pre-sorted rows.",
    HashAggregate: "computes aggregates by hashing rows into groups.",
    Limit: "returns only the first N rows from its input.",
    Gather: "collects results from parallel worker processes.",
    "Gather Merge": "reads the results of the parallel workers, preserving any ordering.",
    Hash: "builds an in-memory hash table for use by a hash join.",
    Materialize: "stores its input in memory (or on disk) for repeated access.",
    Append: "concatenates results from multiple sub-plans.",
    "Merge Append": "merges pre-sorted results from multiple sub-plans.",
    Result: "evaluates a simple expression or constant.",
    Unique: "removes duplicate rows from a sorted input.",
    SetOp: "performs set operations (UNION, INTERSECT, EXCEPT).",
    "CTE Scan": "scans the output of a Common Table Expression.",
    "Subquery Scan": "scans the output of a subquery.",
    "Function Scan": "executes a set-returning function.",
    "Values Scan": "scans an inline VALUES list.",
    WindowAgg: "computes window functions over partitioned/ordered rows.",
    LockRows: "locks selected rows for UPDATE or DELETE.",
    ModifyTable: "performs INSERT, UPDATE, or DELETE operations.",
    "Incremental Sort": "sorts rows incrementally using already-sorted prefix keys.",
    Memoize: "caches results of the inner plan to avoid redundant work.",
  };
  const nodeType = node["Node Type"] as string;
  return descriptions[nodeType] ?? `performs the ${nodeType} operation.`;
}

// --- Layout computation ---

function computeLayout(root: PlanNode): LayoutNode {
  function build(node: PlanNode): LayoutNode {
    const children = node.children.map(build);
    const childrenWidth =
      children.reduce((sum, c) => sum + c.subtreeWidth, 0) +
      Math.max(0, children.length - 1) * GAP_H;
    return {
      node,
      x: 0,
      y: 0,
      subtreeWidth: Math.max(NODE_W, childrenWidth),
      children,
    };
  }

  const layoutRoot = build(root);

  function position(ln: LayoutNode, x: number, y: number) {
    ln.x = x + (ln.subtreeWidth - NODE_W) / 2;
    ln.y = y;
    let childX = x;
    for (const child of ln.children) {
      position(child, childX, y + NODE_H + GAP_V);
      childX += child.subtreeWidth + GAP_H;
    }
  }

  position(layoutRoot, 0, 0);
  return layoutRoot;
}

function getBounds(ln: LayoutNode): Bounds {
  let minX = ln.x;
  let minY = ln.y;
  let maxX = ln.x + NODE_W;
  let maxY = ln.y + NODE_H;
  for (const child of ln.children) {
    const cb = getBounds(child);
    if (cb.minX < minX) minX = cb.minX;
    if (cb.minY < minY) minY = cb.minY;
    if (cb.maxX > maxX) maxX = cb.maxX;
    if (cb.maxY > maxY) maxY = cb.maxY;
  }
  return { minX, minY, maxX, maxY };
}

function flattenLayout(ln: LayoutNode): LayoutNode[] {
  const result: LayoutNode[] = [ln];
  for (const child of ln.children) {
    result.push(...flattenLayout(child));
  }
  return result;
}

function collectEdges(ln: LayoutNode): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const result: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  for (const child of ln.children) {
    result.push({ parent: ln, child });
    result.push(...collectEdges(child));
  }
  return result;
}
