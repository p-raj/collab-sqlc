/** Shared metric types, selector component, and bar computation for explain views. */

import type { Plan, PlanNode } from "./types";
import { formatDuration, formatRows, formatCost, formatBlocks } from "./format";

export type Metric = "time" | "rows" | "estimation" | "cost" | "buffers" | "io";

export const ALL_METRICS: Metric[] = ["time", "rows", "estimation", "cost", "buffers", "io"];

export interface BarData {
  /** 0..100 percentage for bar width and color */
  percent: number;
  /** Human-readable label */
  label: string;
}

function nodeSharedBlocks(node: PlanNode): number {
  return (
    ((node["Shared Hit Blocks"] as number) ?? 0) +
    ((node["Shared Read Blocks"] as number) ?? 0) +
    ((node["Shared Dirtied Blocks"] as number) ?? 0) +
    ((node["Shared Written Blocks"] as number) ?? 0)
  );
}

function nodeIoTime(node: PlanNode): number {
  return ((node["I/O Read Time"] as number) ?? 0) + ((node["I/O Write Time"] as number) ?? 0);
}

export function computeBar(node: PlanNode, plan: Plan, metric: Metric): BarData {
  switch (metric) {
    case "time":
      return {
        percent: plan.maxDuration > 0 ? (node.exclusiveDuration / plan.maxDuration) * 100 : 0,
        label: plan.isAnalyze ? formatDuration(node.exclusiveDuration) : "n/a",
      };
    case "rows":
      return {
        percent: plan.maxRows > 0 ? (node.actualRowsRevised / plan.maxRows) * 100 : 0,
        label: formatRows(node.actualRowsRevised),
      };
    case "estimation": {
      const pct =
        plan.maxEstimateFactor > 1
          ? ((node.estimateFactor - 1) / (plan.maxEstimateFactor - 1)) * 100
          : 0;
      const dir = node.estimateDirection === "under" ? "↑" : node.estimateDirection === "over" ? "↓" : "";
      return {
        percent: pct,
        label: node.estimateDirection !== "none" ? `${node.estimateFactor.toFixed(1)}× ${dir}` : "1×",
      };
    }
    case "cost":
      return {
        percent: plan.maxCost > 0 ? (node.exclusiveCost / plan.maxCost) * 100 : 0,
        label: formatCost(node.exclusiveCost),
      };
    case "buffers": {
      const blocks = nodeSharedBlocks(node);
      return {
        percent: plan.maxSharedBlocks > 0 ? (blocks / plan.maxSharedBlocks) * 100 : 0,
        label: blocks > 0 ? formatBlocks(blocks) : "—",
      };
    }
    case "io": {
      const ioMs = nodeIoTime(node);
      return {
        percent: plan.maxIo > 0 ? (ioMs / plan.maxIo) * 100 : 0,
        label: ioMs > 0 ? formatDuration(ioMs) : "—",
      };
    }
  }
}

/** Returns true if the metric has meaningful data in this plan. */
export function metricAvailable(plan: Plan, metric: Metric): boolean {
  switch (metric) {
    case "time":
      return plan.isAnalyze;
    case "rows":
      return true;
    case "estimation":
      return plan.isAnalyze && plan.maxEstimateFactor > 1;
    case "cost":
      return true;
    case "buffers":
      return plan.maxSharedBlocks > 1;
    case "io":
      return plan.flatNodes.some((n) => nodeIoTime(n) > 0);
  }
}
