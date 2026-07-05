import { useCallback, useEffect, useReducer } from "react";
import {
  Database,
  Table2,
  Columns3,
  Key,
  RefreshCw,
  ChevronRight,
  Play,
} from "lucide-react";
import { Badge } from "@/shared/components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "@/shared/components/ui/DataState";
import { IconButton } from "@/shared/components/ui/IconButton";
import { Input } from "@/shared/components/ui/Input";
import { ObjectListItem } from "@/shared/components/ui/ObjectListItem";
import { useSchemaStore } from "../hooks/use-schema-store";
import type { CatalogObject, ColumnInfo, SchemaGroup, TableInfo } from "../types";

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
  onSelectTable?: (schemaName: string, tableName: string, objectId?: string) => void;
  onGenerateSelect?: (schemaName: string, tableName: string, objectId?: string) => void;
}

function TableRow({
  table,
  schemaName,
  isExpanded,
  onToggle,
  onSelectTable,
  onGenerateSelect,
  object,
}: {
  table: TableInfo;
  schemaName: string;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectTable?: (schemaName: string, tableName: string, objectId?: string) => void;
  onGenerateSelect?: (schemaName: string, tableName: string, objectId?: string) => void;
  object: CatalogObject | null;
}) {
  const tableKey = `${schemaName}.${table.table_name}`;
  const objectLabel = object?.kind === "key" ? "key" : "table";
  const previewLabel = object?.kind === "key" ? "Preview value" : "Preview";

  return (
    <div>
      <div
        className="group flex w-full items-center gap-1.5 py-1 pl-6 pr-2 text-xs hover:bg-accent/50"
        title={table.comment ?? tableKey}
      >
        <IconButton
          aria-label={isExpanded ? `Collapse ${table.table_name}` : `Expand ${table.table_name}`}
          onClick={onToggle}
          size="xs"
          icon={
            <ChevronRight
              size={10}
              className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          }
          className="h-4 w-4"
        />
        <ObjectListItem
          onClick={() => onSelectTable?.(schemaName, table.table_name, object?.id)}
          indicator={<Table2 size={11} className="shrink-0 text-muted-foreground/70" />}
          className="p-0 hover:bg-transparent"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{table.table_name}</span>
            {object?.data_type && <Badge className="text-[10px]">{object.data_type}</Badge>}
          </span>
        </ObjectListItem>
        {table.row_count != null && (
          <span className="shrink-0 text-[0.75rem] text-muted-foreground/50">
            {table.row_count.toLocaleString()}
          </span>
        )}
        <IconButton
          aria-label={`${previewLabel} ${objectLabel}`}
          onClick={(e) => {
            e.stopPropagation();
            onGenerateSelect?.(schemaName, table.table_name, object?.id);
          }}
          size="xs"
          icon={<Play size={10} />}
          className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
          title={`${previewLabel} ${objectLabel}`}
        />
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
  getObjectForTable,
}: {
  group: SchemaGroup;
  isExpanded: boolean;
  expandedTables: Set<string>;
  onToggleSchema: () => void;
  onToggleTable: (key: string) => void;
  onSelectTable?: (schemaName: string, tableName: string, objectId?: string) => void;
  onGenerateSelect?: (schemaName: string, tableName: string, objectId?: string) => void;
  getObjectForTable: (schemaName: string, tableName: string) => CatalogObject | null;
}) {
  return (
    <div>
      <ObjectListItem
        onClick={onToggleSchema}
        indicator={
          <>
            <ChevronRight
              size={10}
              className={`shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
            <Database size={11} className="shrink-0 text-muted-foreground/70" />
          </>
        }
        meta={
          <span className="ml-auto shrink-0 text-[0.75rem] text-muted-foreground/50">
            {group.tables.length}
          </span>
        }
        className="w-full font-medium"
      >
        {group.name}
      </ObjectListItem>
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
              object={getObjectForTable(group.name, t.table_name)}
            />
          );
        })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export function SchemaTree({ connectionId, onSelectTable, onGenerateSelect }: SchemaTreeProps) {
  const { loadSchemaExplorer, getGroups, getObjectForTable, loadingIds, error } =
    useSchemaStore();

  const [state, dispatch] = useReducer(treeReducer, {
    expandedSchemas: new Set<string>(),
    expandedTables: new Set<string>(),
    filter: "",
  });

  // Fetch schema when connection changes
  useEffect(() => {
    if (connectionId) {
      dispatch({ type: "RESET" });
      void loadSchemaExplorer(connectionId);
    }
  }, [connectionId, loadSchemaExplorer]);

  const handleRefresh = useCallback(() => {
    if (connectionId) {
      void loadSchemaExplorer(connectionId, true);
    }
  }, [connectionId, loadSchemaExplorer]);

  if (!connectionId) {
    return (
      <EmptyState
        title="Select a connection"
        description="Choose a connection to browse schema."
        className="items-start px-2 py-3 text-left"
      />
    );
  }

  const isLoading = loadingIds.has(connectionId);
  const groups = getGroups(connectionId);
  const filtered = filterGroups(groups, state.filter);
  const resolveObject = (schemaName: string, tableName: string) =>
    getObjectForTable(connectionId, schemaName, tableName);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">Schema</span>
        <IconButton
          aria-label="Refresh schema"
          onClick={handleRefresh}
          disabled={isLoading}
          size="xs"
          icon={<RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />}
          title="Refresh schema"
        />
      </div>

      {groups.length > 0 && (
        <div className="px-2 pb-1">
          <Input
            type="text"
            placeholder="Filter tables..."
            value={state.filter}
            onChange={(e) => dispatch({ type: "SET_FILTER", filter: e.target.value })}
            size="xs"
          />
        </div>
      )}

      {isLoading && groups.length === 0 && (
        <LoadingState label="Loading schema" showLabel className="justify-start px-2 py-3" />
      )}

      {error && <ErrorState message={error} className="px-2 py-2" />}

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
              getObjectForTable={resolveObject}
            />
          ))}
        </div>
      )}

      {!isLoading && groups.length > 0 && filtered.length === 0 && state.filter && (
        <EmptyState
          title="No matching tables"
          description="Change filter text to search again."
          className="items-start px-2 py-2 text-left"
        />
      )}

      {!isLoading && !error && groups.length === 0 && (
        <EmptyState
          title="No tables found"
          description="Refresh schema if this connection changed."
          className="items-start px-2 py-2 text-left"
        />
      )}
    </div>
  );
}
