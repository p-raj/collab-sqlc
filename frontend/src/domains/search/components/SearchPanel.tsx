import { useState, useMemo } from "react";
import { FileText, Table2 } from "lucide-react";
import { useSavedQueriesStore } from "@/domains/queries/hooks/use-saved-queries-store";
import { useSchemaStore } from "@/domains/schema/hooks/use-schema-store";
import type { SavedQuery } from "@/domains/queries/types";
import type { TableInfo } from "@/domains/schema/types";

interface SearchPanelProps {
  connectionId: string | null;
  onOpenQuery: (query: SavedQuery) => void;
  onSelectTable: (schemaName: string, tableName: string) => void;
}

function truncateFirstLine(sql: string, maxLen = 60): string {
  const line = sql.split("\n")[0] ?? "";
  return line.length > maxLen ? line.slice(0, maxLen) + "…" : line;
}

export function SearchPanel({ connectionId, onOpenQuery, onSelectTable }: SearchPanelProps) {
  const [filter, setFilter] = useState("");

  const queries = useSavedQueriesStore((s) => s.queries);
  const getTables = useSchemaStore((s) => s.getTables);

  const tables: TableInfo[] = useMemo(
    () => (connectionId ? getTables(connectionId) : []),
    [connectionId, getTables],
  );

  const normalizedFilter = filter.trim().toLowerCase();

  const matchedQueries = useMemo(() => {
    if (!normalizedFilter) return [];
    return queries.filter(
      (q) =>
        q.title.toLowerCase().includes(normalizedFilter) ||
        q.sql.toLowerCase().includes(normalizedFilter),
    );
  }, [queries, normalizedFilter]);

  const matchedTables = useMemo(() => {
    if (!normalizedFilter) return [];
    return tables.filter((t) => t.table_name.toLowerCase().includes(normalizedFilter));
  }, [tables, normalizedFilter]);

  const hasFilter = normalizedFilter.length > 0;
  const noResults = hasFilter && matchedQueries.length === 0 && matchedTables.length === 0;

  return (
    <div className="flex flex-col gap-2 p-2">
      <input
        type="text"
        placeholder="Search queries & schema..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-7 w-full rounded border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      />

      {!hasFilter && (
        <p className="text-xs text-muted-foreground/60">
          Type to search across saved queries and schema
        </p>
      )}

      {noResults && <p className="text-xs text-muted-foreground/60">No results</p>}

      {matchedQueries.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.75rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Queries
          </span>
          {matchedQueries.map((q) => (
            <button
              key={q.id}
              onClick={() => onOpenQuery(q)}
              className="flex items-start gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent"
            >
              <FileText size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{q.title}</div>
                <div className="truncate text-[0.75rem] text-muted-foreground">
                  {truncateFirstLine(q.sql)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {matchedTables.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.75rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Tables
          </span>
          {matchedTables.map((t) => (
            <button
              key={`${t.schema_name}.${t.table_name}`}
              onClick={() => onSelectTable(t.schema_name, t.table_name)}
              className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent"
            >
              <Table2 size={12} className="shrink-0 text-muted-foreground" />
              <span className="truncate text-xs">
                {t.schema_name}.{t.table_name}
              </span>
              <span className="ml-auto shrink-0 text-[0.75rem] text-muted-foreground">
                {t.columns.length} cols
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
