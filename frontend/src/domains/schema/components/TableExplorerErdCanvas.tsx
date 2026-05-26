import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { ErdEdgeInfo, ErdTableInfo, TableErdInfo } from "../types";

const CARD_WIDTH = 260;
const VIEWPORT_HEIGHT = 560;
const PADDING_X = 40;
const PADDING_Y = 40;
const COLUMN_GAP = 140;
const ROW_GAP = 24;
const CARD_HEADER_HEIGHT = 52;
const CARD_BODY_PADDING = 24;
const CARD_ROW_HEIGHT = 20;
const CARD_FOOTER_HEIGHT = 40;
const CARD_MIN_HEIGHT = 188;
const CARD_ROW_GAP = 4;
const RELATIONSHIP_BLOCK_PADDING = 20;
const RELATIONSHIP_BLOCK_HEADING_HEIGHT = 16;
const RELATIONSHIP_BLOCK_LINE_HEIGHT = 20;
const RELATIONSHIP_BLOCK_LINE_GAP = 4;
const MAX_RELATIONSHIP_LINES = 2;
const HIDDEN_HANDLE_STYLE = {
  background: "transparent",
  border: "none",
  height: 8,
  opacity: 0,
  width: 8,
} as const;

interface VisibleColumn {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

interface RelationshipSummary {
  heading: string;
  lines: Array<{
    tag: "IN" | "OUT";
    text: string;
  }>;
  hiddenCount: number;
  preferredSide: "left" | "right";
}

type ErdNodeData = Record<string, unknown> & {
  schemaName: string;
  tableName: string;
  isFocus: boolean;
  columns: VisibleColumn[];
  hiddenCount: number;
  height: number;
  hasLeftHandle: boolean;
  hasRightHandle: boolean;
  relationshipSummary: RelationshipSummary | null;
};

type ErdFlowNode = Node<ErdNodeData, "erdTable">;
type ErdFlowEdge = Edge;

interface PositionedTable {
  table: ErdTableInfo;
  visibleColumns: VisibleColumn[];
  hiddenCount: number;
  relationshipSummary: RelationshipSummary | null;
  x: number;
  y: number;
  height: number;
}

interface FlowLayout {
  focusTable: ErdTableInfo | null;
  nodes: ErdFlowNode[];
  edges: ErdFlowEdge[];
  selfEdges: ErdEdgeInfo[];
}

const nodeTypes: NodeTypes = {
  erdTable: ErdTableNode,
};

export function TableExplorerErdCanvas({ erd }: { erd: TableErdInfo }) {
  const layout = useMemo(() => buildFlowLayout(erd), [erd]);

  if (!layout.focusTable) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-muted/20">
      <div style={{ height: VIEWPORT_HEIGHT, minHeight: VIEWPORT_HEIGHT }}>
        <ReactFlow<ErdFlowNode, ErdFlowEdge>
          nodes={layout.nodes}
          edges={layout.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
        >
          <Background
            id="table-explorer-erd"
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color="hsl(var(--border))"
          />
          <MiniMap
            ariaLabel="ERD overview"
            pannable
            zoomable
            nodeBorderRadius={8}
            nodeStrokeWidth={2}
            maskColor="rgba(15, 23, 42, 0.08)"
            bgColor="hsl(var(--card))"
            nodeColor={(node) =>
              node.data.isFocus ? "hsl(var(--foreground))" : "hsl(var(--muted))"
            }
            nodeStrokeColor={(node) =>
              node.data.isFocus ? "hsl(var(--foreground))" : "hsl(var(--border))"
            }
          />
          <Controls showInteractive={false} fitViewOptions={{ padding: 0.15 }}>
            <ErdRecenterControl focusNodeId={erd.focus_table_key} />
          </Controls>
        </ReactFlow>
      </div>

      {layout.selfEdges.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          {layout.selfEdges.length} self relationship
          {layout.selfEdges.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

function ErdTableNode({ data }: NodeProps<ErdFlowNode>) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-card ${
        data.isFocus ? "border-foreground/40 shadow-sm" : "border-border/80"
      }`}
      style={{ height: data.height, width: CARD_WIDTH }}
    >
      {data.hasLeftHandle && renderCardHandles("left", Position.Left)}
      {data.hasRightHandle && renderCardHandles("right", Position.Right)}

      <div className="border-b px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {data.schemaName}
        </div>
        <div className="truncate text-sm font-semibold">{data.tableName}</div>
      </div>

      {data.relationshipSummary && (
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {data.relationshipSummary.heading}
          </div>
          <div className="space-y-1">
            {data.relationshipSummary.lines.map((line) => (
              <div key={`${line.tag}-${line.text}`} className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-foreground/80">
                  {line.tag}
                </span>
                <span className="truncate text-foreground/80">{line.text}</span>
              </div>
            ))}
            {data.relationshipSummary.hiddenCount > 0 && (
              <div className="text-[11px] text-muted-foreground">
                +{data.relationshipSummary.hiddenCount} more relationship
                {data.relationshipSummary.hiddenCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1 px-4 py-3">
        {data.columns.map((column) => (
          <div key={column.name} className="flex items-center gap-2 text-xs">
            <span className="flex shrink-0 gap-1">
              {column.isPrimaryKey && (
                <span className="rounded bg-foreground/10 px-1 py-0.5 text-[10px] font-medium">
                  PK
                </span>
              )}
              {column.isForeignKey && !column.isPrimaryKey && (
                <span className="rounded bg-accent px-1 py-0.5 text-[10px] font-medium">FK</span>
              )}
            </span>
            <span className="truncate font-medium">{column.name}</span>
            <span className="ml-auto truncate text-[11px] text-muted-foreground">
              {column.dataType}
            </span>
          </div>
        ))}

        {data.columns.length === 0 && (
          <div className="pt-1 text-xs text-muted-foreground">No columns available</div>
        )}
      </div>

      <div className="mt-auto flex shrink-0 items-center justify-between border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>{data.isFocus ? "Focus table" : "Related table"}</span>
        {data.hiddenCount > 0 && <span>+{data.hiddenCount} more</span>}
      </div>
    </div>
  );
}

function ErdRecenterControl({ focusNodeId }: { focusNodeId: string }) {
  const reactFlow = useReactFlow<ErdFlowNode, ErdFlowEdge>();
  const handleRecenter = useCallback(() => {
    const focusNode = reactFlow.getNode(focusNodeId);
    if (!focusNode) {
      return;
    }

    const centerX = focusNode.position.x + CARD_WIDTH / 2;
    const centerY = focusNode.position.y + focusNode.data.height / 2;
    void reactFlow.setCenter(centerX, centerY, {
      zoom: reactFlow.getZoom(),
      duration: 240,
    });
  }, [focusNodeId, reactFlow]);

  return (
    <ControlButton
      aria-label="Recenter on focus table"
      title="Recenter on focus table"
      onClick={handleRecenter}
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M8 1.5V4M8 12V14.5M1.5 8H4M12 8H14.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </ControlButton>
  );
}

function buildFlowLayout(erd: TableErdInfo): FlowLayout {
  const focusTable = erd.tables.find((table) => tableKey(table) === erd.focus_table_key) ?? null;
  const tableByKey = new Map(erd.tables.map((table) => [tableKey(table), table]));
  const relationshipSummaries = buildRelationshipSummaries(erd);
  const relationEdges = erd.edges.filter(
    (edge) =>
      !(
        edge.source_table_key === erd.focus_table_key &&
        edge.target_table_key === erd.focus_table_key
      ),
  );

  const incomingKeys = unique(
    erd.edges
      .filter(
        (edge) =>
          edge.target_table_key === erd.focus_table_key &&
          edge.source_table_key !== erd.focus_table_key,
      )
      .map((edge) => edge.source_table_key),
  );
  const outgoingKeys = unique(
    erd.edges
      .filter(
        (edge) =>
          edge.source_table_key === erd.focus_table_key &&
          edge.target_table_key !== erd.focus_table_key,
      )
      .map((edge) => edge.target_table_key),
  );

  const incomingSet = new Set(incomingKeys);
  const outgoingSet = new Set(outgoingKeys);
  const sharedKeys = incomingKeys.filter((key) => outgoingSet.has(key));
  const incomingOnlyKeys = incomingKeys.filter((key) => !outgoingSet.has(key));
  const outgoingOnlyKeys = outgoingKeys.filter((key) => !incomingSet.has(key));

  const mixedLeftKeys = sharedKeys.filter(
    (key) => relationshipSummaries.get(key)?.preferredSide === "left",
  );
  const mixedRightKeys = sharedKeys.filter(
    (key) => relationshipSummaries.get(key)?.preferredSide !== "left",
  );

  const focusCard = focusTable ? createPositionedTable(focusTable, erd, null) : null;
  const incomingCards = [...incomingOnlyKeys, ...mixedLeftKeys]
    .map((key) => tableByKey.get(key))
    .filter((table): table is ErdTableInfo => table != null)
    .map((table) => createPositionedTable(table, erd, relationshipSummaries.get(tableKey(table)) ?? null));
  const outgoingCards = [...mixedRightKeys, ...outgoingOnlyKeys]
    .map((key) => tableByKey.get(key))
    .filter((table): table is ErdTableInfo => table != null)
    .map((table) => createPositionedTable(table, erd, relationshipSummaries.get(tableKey(table)) ?? null));

  const positionedTables: PositionedTable[] = [];
  if (focusCard) {
    const focusPositioned = {
      ...focusCard,
      x: -CARD_WIDTH / 2,
      y: -focusCard.height / 2,
    };
    const incomingLayout = layoutSide({
      focusCard: focusPositioned,
      relatedCards: incomingCards,
      edges: relationEdges.filter((edge) => edge.target_table_key === erd.focus_table_key),
      direction: "RL",
    });
    const outgoingLayout = layoutSide({
      focusCard: focusPositioned,
      relatedCards: outgoingCards,
      edges: relationEdges.filter((edge) => edge.source_table_key === erd.focus_table_key),
      direction: "LR",
    });

    const allTables = [
      ...incomingLayout.tables,
      focusPositioned,
      ...outgoingLayout.tables,
    ];
    const minX = Math.min(...allTables.map((table) => table.x));
    const maxX = Math.max(...allTables.map((table) => table.x + CARD_WIDTH));
    const minY = Math.min(...allTables.map((table) => table.y));
    const maxY = Math.max(...allTables.map((table) => table.y + table.height));
    const horizontalRadius = Math.max(Math.abs(minX), Math.abs(maxX));
    const verticalRadius = Math.max(Math.abs(minY), Math.abs(maxY));

    positionedTables.push(
      ...allTables.map((table) => ({
        ...table,
        x: table.x + horizontalRadius + PADDING_X,
        y: table.y + verticalRadius + PADDING_Y,
      })),
    );
  }

  const positionedTableByKey = new Map(
    positionedTables.map((table) => [tableKey(table.table), table]),
  );

  // Determine which sides each node needs handles on
  const nodesWithLeftHandle = new Set<string>();
  const nodesWithRightHandle = new Set<string>();
  relationEdges.forEach((edge) => {
    const sourceTable = positionedTableByKey.get(edge.source_table_key);
    const targetTable = positionedTableByKey.get(edge.target_table_key);
    if (!sourceTable || !targetTable) {
      return;
    }

    const { sourceSide, targetSide } = getNearestEdgeSides(sourceTable, targetTable);
    if (sourceSide === "left") {
      nodesWithLeftHandle.add(edge.source_table_key);
    } else {
      nodesWithRightHandle.add(edge.source_table_key);
    }
    if (targetSide === "left") {
      nodesWithLeftHandle.add(edge.target_table_key);
    } else {
      nodesWithRightHandle.add(edge.target_table_key);
    }
  });

  // Deduplicate edges: one bezier per unique table pair
  const seenPairs = new Set<string>();
  const deduplicatedEdges: ErdFlowEdge[] = [];
  relationEdges.forEach((edge) => {
    const pairKey = `${edge.source_table_key}→${edge.target_table_key}`;
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);

    const sourceTable = positionedTableByKey.get(edge.source_table_key);
    const targetTable = positionedTableByKey.get(edge.target_table_key);
    const sourceSide =
      sourceTable && targetTable ? getNearestEdgeSides(sourceTable, targetTable).sourceSide : "right";
    const targetSide =
      sourceTable && targetTable ? getNearestEdgeSides(sourceTable, targetTable).targetSide : "left";

    deduplicatedEdges.push({
      id: edge.id,
      source: edge.source_table_key,
      target: edge.target_table_key,
      type: "default",
      sourceHandle: sourceHandleId(sourceSide),
      targetHandle: targetHandleId(targetSide),
      selectable: false,
      focusable: false,
      style: {
        stroke: "hsl(var(--foreground) / 0.18)",
        strokeWidth: 1.5,
      },
    });
  });

  return {
    focusTable,
    nodes: positionedTables.map((table) => {
      const key = tableKey(table.table);
      return {
        id: key,
        type: "erdTable",
        position: { x: table.x, y: table.y },
        data: {
          schemaName: table.table.schema_name,
          tableName: table.table.table_name,
          isFocus: table.table.is_focus,
          columns: table.visibleColumns,
          hiddenCount: table.hiddenCount,
          height: table.height,
          hasLeftHandle: nodesWithLeftHandle.has(key),
          hasRightHandle: nodesWithRightHandle.has(key),
          relationshipSummary: table.relationshipSummary,
        },
        draggable: false,
        selectable: false,
      };
    }),
    edges: deduplicatedEdges,
    selfEdges: erd.edges.filter(
      (edge) =>
        edge.source_table_key === erd.focus_table_key &&
        edge.target_table_key === erd.focus_table_key,
    ),
  };
}

function createPositionedTable(
  table: ErdTableInfo,
  erd: TableErdInfo,
  relationshipSummary: RelationshipSummary | null,
): PositionedTable {
  const { columns, hiddenCount } = getVisibleColumns(table, erd);
  return {
    table,
    visibleColumns: columns,
    hiddenCount,
    relationshipSummary,
    x: 0,
    y: 0,
    height: getCardHeight(columns.length, relationshipSummary),
  };
}

function getCardHeight(
  visibleColumnCount: number,
  relationshipSummary: RelationshipSummary | null,
): number {
  const columnRows = Math.max(visibleColumnCount, 1);
  const columnHeight =
    CARD_BODY_PADDING +
    columnRows * CARD_ROW_HEIGHT +
    Math.max(columnRows - 1, 0) * CARD_ROW_GAP;

  const relationshipHeight = relationshipSummary
    ? RELATIONSHIP_BLOCK_PADDING +
      RELATIONSHIP_BLOCK_HEADING_HEIGHT +
      relationshipSummary.lines.length * RELATIONSHIP_BLOCK_LINE_HEIGHT +
      Math.max(relationshipSummary.lines.length - 1, 0) * RELATIONSHIP_BLOCK_LINE_GAP +
      (relationshipSummary.hiddenCount > 0
        ? RELATIONSHIP_BLOCK_LINE_HEIGHT + RELATIONSHIP_BLOCK_LINE_GAP
        : 0)
    : 0;

  return Math.max(
    CARD_MIN_HEIGHT,
    CARD_HEADER_HEIGHT +
      relationshipHeight +
      columnHeight +
      CARD_FOOTER_HEIGHT,
  );
}

function getVisibleColumns(
  table: ErdTableInfo,
  erd: TableErdInfo,
): { columns: VisibleColumn[]; hiddenCount: number } {
  const connectedNames = new Set<string>();
  erd.edges.forEach((edge) => {
    if (edge.source_table_key === tableKey(table)) {
      edge.column_mappings.forEach((mapping) => connectedNames.add(mapping.source_column));
    }
    if (edge.target_table_key === tableKey(table)) {
      edge.column_mappings.forEach((mapping) => connectedNames.add(mapping.target_column));
    }
  });

  const prioritized = [...table.columns].sort((left, right) => {
    const leftScore = scoreColumn(left, connectedNames);
    const rightScore = scoreColumn(right, connectedNames);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return left.name.localeCompare(right.name);
  });

  const visible = prioritized.slice(0, 6).map((column) => ({
    name: column.name,
    dataType: column.data_type,
    isPrimaryKey: column.is_primary_key,
    isForeignKey: column.is_foreign_key,
  }));

  return {
    columns: visible,
    hiddenCount: Math.max(prioritized.length - visible.length, 0),
  };
}

function scoreColumn(column: ErdTableInfo["columns"][number], connectedNames: Set<string>): number {
  if (column.is_primary_key) {
    return 4;
  }
  if (connectedNames.has(column.name)) {
    return 3;
  }
  if (column.is_foreign_key) {
    return 2;
  }
  return 1;
}

function tableKey(table: ErdTableInfo): string {
  return `${table.schema_name}.${table.table_name}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function renderCardHandles(side: "left" | "right", position: Position.Left | Position.Right) {
  return (
    <>
      <Handle
        id={sourceHandleId(side)}
        type="source"
        position={position}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id={targetHandleId(side)}
        type="target"
        position={position}
        style={HIDDEN_HANDLE_STYLE}
      />
    </>
  );
}

function sourceHandleId(side: "left" | "right"): string {
  return `source:${side}`;
}

function targetHandleId(side: "left" | "right"): string {
  return `target:${side}`;
}

function getNearestEdgeSides(
  sourceTable: PositionedTable,
  targetTable: PositionedTable,
): { sourceSide: "left" | "right"; targetSide: "left" | "right" } {
  return sourceTable.x <= targetTable.x
    ? { sourceSide: "right", targetSide: "left" }
    : { sourceSide: "left", targetSide: "right" };
}

function buildRelationshipSummaries(erd: TableErdInfo): Map<string, RelationshipSummary> {
  const summaries = new Map<
    string,
    {
      incoming: string[];
      outgoing: string[];
    }
  >();

  erd.edges.forEach((edge) => {
    if (edge.source_table_key === erd.focus_table_key && edge.target_table_key !== erd.focus_table_key) {
      const current = summaries.get(edge.target_table_key) ?? { incoming: [], outgoing: [] };
      current.outgoing.push(formatMappingLine(edge));
      summaries.set(edge.target_table_key, current);
    }

    if (edge.target_table_key === erd.focus_table_key && edge.source_table_key !== erd.focus_table_key) {
      const current = summaries.get(edge.source_table_key) ?? { incoming: [], outgoing: [] };
      current.incoming.push(formatMappingLine(edge));
      summaries.set(edge.source_table_key, current);
    }
  });

  return new Map(
    [...summaries.entries()].map(([tableKeyValue, directions]) => {
      const incomingLines = unique(directions.incoming);
      const outgoingLines = unique(directions.outgoing);
      const allLines =
        incomingLines.length > 0 && outgoingLines.length > 0
          ? [
              ...incomingLines.map((line) => ({ tag: "IN" as const, text: line })),
              ...outgoingLines.map((line) => ({ tag: "OUT" as const, text: line })),
            ]
          : incomingLines.length > 0
            ? incomingLines.map((line) => ({ tag: "IN" as const, text: line }))
            : outgoingLines.map((line) => ({ tag: "OUT" as const, text: line }));
      const heading =
        incomingLines.length > 0 && outgoingLines.length > 0
          ? "Links with focus"
          : incomingLines.length > 0
            ? "References focus"
            : "Referenced by focus";

      return [
        tableKeyValue,
        {
          heading,
          lines: allLines.slice(0, MAX_RELATIONSHIP_LINES),
          hiddenCount: Math.max(allLines.length - MAX_RELATIONSHIP_LINES, 0),
          preferredSide: outgoingLines.length > incomingLines.length ? "right" : "left",
        },
      ];
    }),
  );
}

function formatMappingLine(edge: ErdEdgeInfo): string {
  const mappings = edge.column_mappings.map(
    (mapping) => `${mapping.source_column} -> ${mapping.target_column}`,
  );
  const [firstMapping] = mappings;

  if (mappings.length === 0) {
    return edge.constraint_name ?? "Relationship";
  }

  if (mappings.length === 1 && firstMapping) {
    return firstMapping;
  }

  return `${firstMapping ?? "Relationship"} (+${mappings.length - 1})`;
}

function layoutSide({
  direction,
  edges,
  focusCard,
  relatedCards,
}: {
  focusCard: PositionedTable;
  relatedCards: PositionedTable[];
  edges: ErdEdgeInfo[];
  direction: "LR" | "RL";
}): { tables: PositionedTable[] } {
  if (relatedCards.length === 0) {
    return { tables: [] };
  }

  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    align: "UL",
    nodesep: ROW_GAP + 20,
    ranksep: COLUMN_GAP,
    edgesep: 28,
    marginx: 0,
    marginy: 0,
  });

  graph.setNode(tableKey(focusCard.table), { width: CARD_WIDTH, height: focusCard.height });
  relatedCards.forEach((table) => {
    graph.setNode(tableKey(table.table), { width: CARD_WIDTH, height: table.height });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source_table_key, edge.target_table_key, {
      weight: 3,
      minlen: 1,
    });
  });

  dagre.layout(graph);
  const focusLayoutNode = graph.node(tableKey(focusCard.table));

  return {
    tables: relatedCards.map((table) => {
      const layoutNode = graph.node(tableKey(table.table));
      return {
        ...table,
        x: layoutNode.x - focusLayoutNode.x - CARD_WIDTH / 2,
        y: layoutNode.y - focusLayoutNode.y - table.height / 2,
      };
    }),
  };
}
