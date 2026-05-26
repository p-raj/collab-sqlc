/** Formatting utilities for plan values. */

import type { PlanNode } from "./types";

export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

export function formatRows(rows: number): string {
  if (rows < 1000) return rows.toFixed(0);
  if (rows < 1_000_000) return `${(rows / 1000).toFixed(1)}k`;
  return `${(rows / 1_000_000).toFixed(1)}M`;
}

export function formatCost(cost: number): string {
  if (cost < 1000) return cost.toFixed(1);
  if (cost < 1_000_000) return `${(cost / 1000).toFixed(1)}k`;
  return `${(cost / 1_000_000).toFixed(1)}M`;
}

export function formatBlocks(blocks: number): string {
  if (blocks < 1000) return blocks.toFixed(0);
  if (blocks < 1_000_000) return `${(blocks / 1000).toFixed(1)}k`;
  return `${(blocks / 1_000_000).toFixed(1)}M`;
}

export function formatPercent(value: number): string {
  if (value < 0.1) return "<0.1%";
  return `${value.toFixed(1)}%`;
}

export function getNodeName(node: PlanNode): string {
  const parts: string[] = [];
  if (node["Parallel Aware"]) parts.push("Parallel");
  if (node["Partial Mode"]) parts.push(node["Partial Mode"] as string);
  parts.push(node["Node Type"]);
  if (node["Scan Direction"] && node["Scan Direction"] !== "Forward") {
    parts.push(node["Scan Direction"] as string);
  }
  let name = parts.join(" ");
  if (node["Join Type"]) {
    name = name.replace("Join", `${node["Join Type"]} Join`);
  }
  return name;
}

export function getNodeRelation(node: PlanNode): string | null {
  const relation = node["Relation Name"] as string | undefined;
  if (!relation) return null;
  const parts: string[] = [];
  if (node["Schema"]) parts.push(`${node["Schema"]}.`);
  parts.push(relation);
  if (node["Alias"] && node["Alias"] !== relation) {
    parts.push(` as ${node["Alias"]}`);
  }
  return parts.join("");
}
