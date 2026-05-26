/** Types for PostgreSQL EXPLAIN ANALYZE plan visualization. */

/** Raw plan node from PostgreSQL EXPLAIN (FORMAT JSON). */
export interface RawPlanNode {
  "Node Type": string;
  "Join Type"?: string;
  "Scan Direction"?: string;
  "Partial Mode"?: string;
  "Parallel Aware"?: boolean;
  "Plan Rows": number;
  "Plan Width"?: number;
  "Startup Cost": number;
  "Total Cost": number;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Actual Startup Time"?: number;
  "Actual Total Time"?: number;
  "Relation Name"?: string;
  "Schema"?: string;
  "Alias"?: string;
  "Index Name"?: string;
  "Index Cond"?: string;
  "Function Name"?: string;
  "Filter"?: string;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Join Filter"?: number;
  "Join Filter"?: string;
  "Sort Key"?: string[];
  "Sort Method"?: string;
  "Sort Space Used"?: number;
  "Sort Space Type"?: string;
  "Group Key"?: string[];
  "Hash Cond"?: string;
  "Hash Buckets"?: number;
  "Hash Batches"?: number;
  "Peak Memory Usage"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Shared Dirtied Blocks"?: number;
  "Shared Written Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  "Local Hit Blocks"?: number;
  "Local Read Blocks"?: number;
  "Local Dirtied Blocks"?: number;
  "Local Written Blocks"?: number;
  "I/O Read Time"?: number;
  "I/O Write Time"?: number;
  "Workers Planned"?: number;
  "Workers Launched"?: number;
  "Workers"?: RawPlanNode[];
  "Plans"?: RawPlanNode[];
  "Output"?: string[];
  "CTE Name"?: string;
  "Subplan Name"?: string;
  [key: string]: unknown;
}

/** Enriched plan node with computed metrics. */
export interface PlanNode extends RawPlanNode {
  nodeId: number;
  exclusiveDuration: number;
  exclusiveCost: number;
  actualRowsRevised: number;
  estimateFactor: number;
  estimateDirection: "over" | "under" | "none";
  durationPercent: number;
  costPercent: number;
  depth: number;
  isLastChild: boolean;
  /** ancestors[i] is true if the ancestor at depth i was the last child of its parent. */
  ancestors: boolean[];
  children: PlanNode[];
}

/** Parsed and enriched plan ready for visualization. */
export interface Plan {
  root: PlanNode;
  executionTime: number;
  planningTime: number;
  maxDuration: number;
  maxCost: number;
  maxRows: number;
  maxEstimateFactor: number;
  maxSharedBlocks: number;
  maxIo: number;
  totalNodes: number;
  flatNodes: PlanNode[];
  isAnalyze: boolean;
  triggers?: Array<{ "Trigger Name": string; Time: number; Calls: number }>;
  jit?: Record<string, unknown>;
  settings?: Record<string, string>;
}
