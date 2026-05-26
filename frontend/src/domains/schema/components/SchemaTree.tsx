import { useCallback, useEffect, useReducer } from "react";
import {
  Database,
  Table2,
  Columns3,
  Key,
  RefreshCw,
  ChevronRight,
  Loader2,
  AlertCircle,
  Play,
} from "lucide-react";
import { useSchemaStore } from "../hooks/use-schema-store";
import type { ColumnInfo, SchemaGroup, TableInfo } from "../types";

// ── State ──────────────────────────────────────────────────

interface TreeState {
  expandedSchemas: Set<string>;
  expandedTables: Set<string>;
  filter: string;
}

type TreeAction =
  | { type: "TOGGLE_SCHEMA"; name: string }
  | { type: "TOGGLE_TABLE"; key: string }
  | { type: "SET_FILTER"; filter: string }
  | { type: "RESET" };

function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "TOGGLE_SCHEMA": {
      const next = new Set(state.expandedSchemas);
      if (next.has(action.name)) next.delete(action.name);
      else next.add(action.name);
      return { ...state, expandedSchemas: next };
    }
    case "TOGGLE_TABLE": {
      const next = new Set(state.expandedTables);
      if (next.has(action.key)) next.delete(action.key);
      else next.add(action.key);
      return { ...state, expandedTables: next };
    }
    case "SET_FILTER":
      return { ...state, filter: action.filter };
    case "RESET":
      return { expandedSchemas: new Set(), expandedTables: new Set(), filter: "" };
  }
}

// ── Helpers ────────────────────────────────────────────────

function filterGroups(groups: SchemaGroup[], filter: string): SchemaGroup[] {
  if (!filter) return groups;
  const lower = filter.toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      tables: g.tables.filter(
        (t) =>
          t.table_name.toLowerCase().includes(lower) ||
          t.columns.some((c) => c.name.toLowerCase().includes(lower)),
      ),
    }))
    .filter((g) => g.tables.length > 0);
}

// ── Sub-components ─────────────────────────────────────────

function ColumnRow({ column }: { column: ColumnInfo }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 pl-10 pr-2 text-xs text-muted-foreground hover:bg-accent/50">
      {column.is_primary_key ? (
        <Key size={10} className="shrink-0 text-muted-foreground/80" />
      ) : (
        <Columns3 size={10} className="shrink-0 text-muted-foreground/50" />
      )}
      <span className="truncate">{column.name}</span>
      <span className="ml-auto shrink-0 text-[0.75rem] text-muted-foreground/50">
        {column.data_type}
      </span>
    </div>
  );
}

interface SchemaTreeProps {
  connectionId: string | null;
  onSelectTable?: (schemaName: string, tableName: string) => void;
  onGenerateSelect?: (schemaName: string, tableName: string) => void;
}

function TableRow({
  table,
  schemaName,
  isExpanded,
  onToggle,
  onSelectTable,
  onGenerateSelect,
}: {
  table: TableInfo;
  schemaName: string;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectTable?: (schemaName: string, tableName: string) => void;
  onGenerateSelect?: (schemaName: string, tableName: string) => void;
}) {
  const tableKey = `${schemaName}.${table.table_name}`;

  return (
    <div>
      <div
        className="group flex w-full items-center gap-1.5 py-1 pl-6 pr-2 text-xs hover:bg-accent/50"
        title={table.comment ?? tableKey}
      >
        <button onClick={onToggle} className="shrink-0 p-0.5">
          <ChevronRight
            size={10}
            className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        </button>
        <button
          onClick={() => onSelectTable?.(schemaName, table.table_name)}
          className="flex min-w-0 flex-1 items-center gap-1.5"
        >
          <Table2 size={11} className="shrink-0 text-muted-foreground/70" />
          <span className="truncate">{table.table_name}</span>
        </button>
        {table.row_count != null && (
          <span className="shrink-0 text-[0.75rem] text-muted-foreground/50">
            {table.row_count.toLocaleString()}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerateSelect?.(schemaName, table.table_name);
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
          title={`SELECT * FROM ${schemaName}.${table.table_name}`}
        >
          <Play size={10} />
        </button>
      </div>
      {isExpanded && table.columns.map((col) => <ColumnRow key={col.name} column={col} />)}
    </div>
  );
}

function SchemaGroupRow({
  group,
  isExpanded,
  expandedTables,
  onToggleSchema,
  onToggleTable,
  onSelectTable,
  onGenerateSelect,
}: {
  group: SchemaGroup;
  isExpanded: boolean;
  expandedTables: Set<string>;
  onToggleSchema: () => void;
  onToggleTable: (key: string) => void;
  onSelectTable?: (schemaName: string, tableName: string) => void;
  onGenerateSelect?: (schemaName: string, tableName: string) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggleSchema}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-xs font-medium hover:bg-accent/50"
      >
        <ChevronRight
          size={10}
          className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <Database size={11} className="shrink-0 text-muted-foreground/70" />
        <span className="truncate">{group.name}</span>
        <span className="ml-auto shrink-0 text-[0.75rem] text-muted-foreground/50">
          {group.tables.length}
        </span>
      </button>
      {isExpanded &&
        group.tables.map((t) => {
          const key = `${group.name}.${t.table_name}`;
          return (
            <TableRow
              key={key}
              table={t}
              schemaName={group.name}
              isExpanded={expandedTables.has(key)}
              onToggle={() => onToggleTable(key)}
              onSelectTable={onSelectTable}
              onGenerateSelect={onGenerateSelect}
            />
          );
        })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export function SchemaTree({ connectionId, onSelectTable, onGenerateSelect }: SchemaTreeProps) {
  const { fetchSchema, getGroups, loadingIds, error } = useSchemaStore();

  const [state, dispatch] = useReducer(treeReducer, {
    expandedSchemas: new Set<string>(),
    expandedTables: new Set<string>(),
    filter: "",
  });

  // Fetch schema when connection changes
  useEffect(() => {
    if (connectionId) {
      dispatch({ type: "RESET" });
      fetchSchema(connectionId);
    }
  }, [connectionId, fetchSchema]);

  const handleRefresh = useCallback(() => {
    if (connectionId) {
      fetchSchema(connectionId, true);
    }
  }, [connectionId, fetchSchema]);

  if (!connectionId) {
    return (
      <div className="px-2 py-3 text-xs text-muted-foreground/60">
        Select a connection to browse schema
      </div>
    );
  }

  const isLoading = loadingIds.has(connectionId);
  const groups = getGroups(connectionId);
  const filtered = filterGroups(groups, state.filter);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">Schema</span>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
          title="Refresh schema"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filter input */}
      {groups.length > 0 && (
        <div className="px-2 pb-1">
          <input
            type="text"
            placeholder="Filter tables..."
            value={state.filter}
            onChange={(e) => dispatch({ type: "SET_FILTER", filter: e.target.value })}
            className="h-6 w-full rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && groups.length === 0 && (
        <div className="flex items-center gap-1.5 px-2 py-3">
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading schema...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 px-2 py-2">
          <AlertCircle size={12} className="shrink-0 text-destructive" />
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}

      {/* Tree */}
      {filtered.length > 0 && (
        <div className="overflow-y-auto">
          {filtered.map((g) => (
            <SchemaGroupRow
              key={g.name}
              group={g}
              isExpanded={state.expandedSchemas.has(g.name)}
              expandedTables={state.expandedTables}
              onToggleSchema={() => dispatch({ type: "TOGGLE_SCHEMA", name: g.name })}
              onToggleTable={(key) => dispatch({ type: "TOGGLE_TABLE", key })}
              onSelectTable={onSelectTable}
              onGenerateSelect={onGenerateSelect}
            />
          ))}
        </div>
      )}

      {/* Empty after filter */}
      {!isLoading && groups.length > 0 && filtered.length === 0 && state.filter && (
        <div className="px-2 py-2 text-xs text-muted-foreground/60">No matching tables</div>
      )}

      {/* Empty schema */}
      {!isLoading && !error && groups.length === 0 && (
        <div className="px-2 py-2 text-xs text-muted-foreground/60">No tables found</div>
      )}
    </div>
  );
}
