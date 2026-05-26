/** Parses PostgreSQL EXPLAIN (FORMAT JSON) output into an enriched Plan. */

import type { Plan, PlanNode, RawPlanNode } from "./types";

let nodeIdCounter = 0;

export function parsePlan(jsonStr: string): Plan {
  const raw: unknown = JSON.parse(jsonStr);
  const content = Array.isArray(raw) ? (raw[0] as Record<string, unknown>) : (raw as Record<string, unknown>);

  if (!content["Plan"]) {
    throw new Error("Invalid EXPLAIN output: missing Plan key");
  }

  nodeIdCounter = 0;
  const root = processNode(content["Plan"] as RawPlanNode, 0, [], true);

  const executionTime =
    (content["Execution Time"] as number) ?? (content["Total Runtime"] as number) ?? 0;
  const planningTime = (content["Planning Time"] as number) ?? 0;

  const flatNodes: PlanNode[] = [];
  flattenNodes(root, flatNodes);

  const maxDuration = Math.max(...flatNodes.map((n) => n.exclusiveDuration), 0.001);
  const maxCost = Math.max(...flatNodes.map((n) => n.exclusiveCost), 0.001);
  const maxRows = Math.max(...flatNodes.map((n) => n.actualRowsRevised), 1);
  const maxEstimateFactor = Math.max(...flatNodes.map((n) => n.estimateFactor), 1);
  const maxSharedBlocks = Math.max(
    ...flatNodes.map(
      (n) =>
        (n["Shared Hit Blocks"] ?? 0) +
        (n["Shared Read Blocks"] ?? 0) +
        (n["Shared Dirtied Blocks"] ?? 0) +
        (n["Shared Written Blocks"] ?? 0),
    ),
    1,
  );
  const maxIo = Math.max(
    ...flatNodes.map(
      (n) => ((n["I/O Read Time"] as number) ?? 0) + ((n["I/O Write Time"] as number) ?? 0),
    ),
    0.001,
  );

  for (const node of flatNodes) {
    node.durationPercent =
      executionTime > 0 ? (node.exclusiveDuration / executionTime) * 100 : 0;
    node.costPercent = maxCost > 0 ? (node.exclusiveCost / maxCost) * 100 : 0;
  }

  return {
    root,
    executionTime,
    planningTime,
    maxDuration,
    maxCost,
    maxRows,
    maxEstimateFactor,
    maxSharedBlocks,
    maxIo,
    totalNodes: flatNodes.length,
    flatNodes,
    isAnalyze: flatNodes.some((n) => n["Actual Total Time"] !== undefined),
    triggers: content["Triggers"] as Plan["triggers"],
    jit: content["JIT"] as Plan["jit"],
    settings: content["Settings"] as Plan["settings"],
  };
}

function processNode(
  raw: RawPlanNode,
  depth: number,
  ancestors: boolean[],
  isLastChild: boolean,
): PlanNode {
  const node = { ...raw } as PlanNode;
  node.nodeId = ++nodeIdCounter;
  node.depth = depth;
  node.isLastChild = isLastChild;
  node.ancestors = [...ancestors];

  const rawChildren = (raw["Plans"] as RawPlanNode[]) ?? [];
  node.children = rawChildren.map((child, i) =>
    processNode(child, depth + 1, [...ancestors, isLastChild], i === rawChildren.length - 1),
  );

  const actualRows = (node["Actual Rows"] as number) ?? 0;
  const actualLoops = (node["Actual Loops"] as number) ?? 1;
  node.actualRowsRevised = actualRows * actualLoops;

  // Exclusive duration: this node's total time minus children's
  const totalTime = (node["Actual Total Time"] as number) ?? 0;
  const childrenTime = node.children.reduce(
    (sum, child) =>
      sum +
      ((child["Actual Total Time"] as number) ?? 0) *
        ((child["Actual Loops"] as number) ?? 1),
    0,
  );
  node.exclusiveDuration = Math.max(totalTime * actualLoops - childrenTime, 0);

  // Exclusive cost: this node's total cost minus children's
  const totalCost = (node["Total Cost"] as number) ?? 0;
  const childrenCost = node.children.reduce(
    (sum, child) => sum + ((child["Total Cost"] as number) ?? 0),
    0,
  );
  node.exclusiveCost = Math.max(totalCost - childrenCost, 0);

  // Planner estimate factor
  const planRows = (node["Plan Rows"] as number) ?? 0;
  if (planRows > 0 && actualRows > 0) {
    if (actualRows > planRows) {
      node.estimateFactor = actualRows / planRows;
      node.estimateDirection = "under";
    } else if (planRows > actualRows) {
      node.estimateFactor = planRows / actualRows;
      node.estimateDirection = "over";
    } else {
      node.estimateFactor = 1;
      node.estimateDirection = "none";
    }
  } else {
    node.estimateFactor = 1;
    node.estimateDirection = "none";
  }

  // Initialized; recomputed after all nodes are processed
  node.durationPercent = 0;
  node.costPercent = 0;

  return node;
}

function flattenNodes(node: PlanNode, result: PlanNode[]): void {
  result.push(node);
  for (const child of node.children) {
    flattenNodes(child, result);
  }
}
