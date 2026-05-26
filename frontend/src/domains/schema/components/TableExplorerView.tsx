import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Play, RefreshCw, Search, Table2 } from "lucide-react";
import { useSchemaStore } from "../hooks/use-schema-store";
import { TableExplorerErdCanvas } from "./TableExplorerErdCanvas";
import type {
  ColumnInfo,
  TableErdInfo,
  TableConstraintInfo,
  TableExplorerTabId,
  TableMetadataInfo,
  TableRelationshipInfo,
} from "../types";

interface TableExplorerViewProps {
  connectionId: string;
  connectionName: string;
  schemaName: string;
  tableName: string;
  activeSection: TableExplorerTabId;
  onChangeSection: (section: TableExplorerTabId) => void;
  onPreviewQuery: (sql: string) => void;
}

const EXPLORER_TABS: Array<{ id: TableExplorerTabId; label: string }> = [
  { id: "schema", label: "Table Schema" },
  { id: "relationships", label: "Relationships" },
  { id: "metadata", label: "Metadata" },
  { id: "erd", label: "ERD" },
];

export function TableExplorerView({
  connectionId,
  connectionName,
  schemaName,
  tableName,
  activeSection,
  onChangeSection,
  onPreviewQuery,
}: TableExplorerViewProps) {
  const [filter, setFilter] = useState("");
  const tableDetailKey = `${connectionId}:${schemaName}:${tableName}`;
  const fetchTableDetail = useSchemaStore((store) => store.fetchTableDetail);
  const detail = useSchemaStore((store) => store.tableDetails[tableDetailKey] ?? null);
  const error = useSchemaStore((store) => store.tableDetailErrors[tableDetailKey] || null);

  useEffect(() => {
    void fetchTableDetail(connectionId, schemaName, tableName);
  }, [connectionId, fetchTableDetail, schemaName, tableName]);

  useEffect(() => {
    setFilter("");
  }, [activeSection, connectionId, schemaName, tableName]);

  const table = detail?.table ?? null;

  const filteredColumns = useMemo(() => {
    if (!table) return [];
    if (!filter.trim()) return table.columns;
    const loweredFilter = filter.toLowerCase();
    return table.columns.filter(
      (column) =>
        column.name.toLowerCase().includes(loweredFilter) ||
        column.data_type.toLowerCase().includes(loweredFilter),
    );
  }, [filter, table]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{connectionName}</span>
          <ChevronRight size={12} />
          <span>{schemaName}</span>
        </div>

        <div className="mb-1 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <Table2 size={18} className="shrink-0 text-muted-foreground" />
            <h1 className="truncate text-lg font-semibold">
              {schemaName}.{tableName}
            </h1>
          </div>
          <button
            onClick={() => onPreviewQuery(`SELECT * FROM "${schemaName}"."${tableName}" LIMIT 100`)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play size={12} />
            Preview
          </button>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          {table?.comment ??
            "Explore structure, relationships, metadata, and the local ERD for this table."}
          {table?.row_count != null && (
            <span className="ml-2 text-xs">~{table.row_count.toLocaleString()} rows</span>
          )}
        </p>

        <div
          role="tablist"
          aria-label="Table explorer sections"
          className="mb-5 flex items-center gap-4 border-b"
        >
          {EXPLORER_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeSection === tab.id}
              onClick={() => onChangeSection(tab.id)}
              className={`pb-2 text-sm font-medium ${
                activeSection === tab.id
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!detail && error && (
          <ErrorState
            message={error}
            onRetry={() => void fetchTableDetail(connectionId, schemaName, tableName, true)}
          />
        )}
        {!detail && !error && <LoadingState />}

        {detail && activeSection === "schema" && (
          <SchemaSection columns={filteredColumns} filter={filter} onFilterChange={setFilter} />
        )}
        {detail && activeSection === "relationships" && (
          <RelationshipsSection
            incoming={detail.relationships.incoming}
            outgoing={detail.relationships.outgoing}
          />
        )}
        {detail && activeSection === "metadata" && <MetadataSection metadata={detail.metadata} />}
        {detail && activeSection === "erd" && <ErdSection erd={detail.erd} />}
      </div>
    </div>
  );
}

function SchemaSection({
  columns,
  filter,
  onFilterChange,
}: {
  columns: ColumnInfo[];
  filter: string;
  onFilterChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
        />
        <input
          type="text"
          placeholder="Type to filter columns..."
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          className="h-8 w-full rounded border border-input bg-transparent pl-8 pr-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>Columns</span>
        <span className="rounded bg-accent px-1.5 py-0.5 text-[0.75rem]">{columns.length}</span>
      </div>

      <div className="overflow-x-auto rounded border">
        <ColumnTable columns={columns} />
      </div>
    </div>
  );
}

function ColumnTable({ columns }: { columns: ColumnInfo[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 font-medium">Type</th>
          <th className="px-3 py-2 font-medium">Nullable</th>
          <th className="px-3 py-2 font-medium">Default</th>
          <th className="px-3 py-2 font-medium">Comment</th>
        </tr>
      </thead>
      <tbody>
        {columns.map((column) => (
          <tr key={column.name} className="border-b last:border-b-0 hover:bg-accent/40">
            <td className="px-3 py-2">
              <span className="flex items-center gap-1.5">
                <span className="font-medium">{column.name}</span>
                {column.is_primary_key && (
                  <span className="rounded bg-foreground/10 px-1 py-0.5 text-[0.75rem] font-medium">
                    PK
                  </span>
                )}
                {column.foreign_key && !column.is_primary_key && (
                  <span className="rounded bg-accent px-1 py-0.5 text-[0.75rem] font-medium">
                    FK
                  </span>
                )}
              </span>
            </td>
            <td className="px-3 py-2">
              <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-mono">
                {column.data_type}
              </span>
            </td>
            <td className="px-3 py-2 text-muted-foreground">
              {column.is_nullable ? "NULL" : "NOT NULL"}
            </td>
            <td className="px-3 py-2 font-mono text-muted-foreground">
              {column.default_value ?? "—"}
            </td>
            <td className="px-3 py-2 text-muted-foreground">{column.comment ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RelationshipsSection({
  incoming,
  outgoing,
}: {
  incoming: TableRelationshipInfo[];
  outgoing: TableRelationshipInfo[];
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        title="No direct relationships"
        description="This table does not have any foreign-key links in the current connection metadata."
      />
    );
  }

  return (
    <div className="space-y-4">
      <RelationshipColumn
        title="Incoming"
        description="Tables that point to this table."
        relationships={incoming}
        direction="incoming"
      />
      <RelationshipColumn
        title="Outgoing"
        description="Tables that this table points to."
        relationships={outgoing}
        direction="outgoing"
      />
    </div>
  );
}

function RelationshipColumn({
  title,
  description,
  relationships,
  direction,
}: {
  title: string;
  description: string;
  relationships: TableRelationshipInfo[];
  direction: "incoming" | "outgoing";
}) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} description={description} />

      {relationships.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          No {title.toLowerCase()} links
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          {relationships.map((relationship) => {
            const relatedTable =
              direction === "incoming"
                ? `${relationship.source_schema_name}.${relationship.source_table_name}`
                : `${relationship.target_schema_name}.${relationship.target_table_name}`;
            return (
              <div
                key={relationship.constraint_name ?? relatedTable}
                className="border-b p-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{relatedTable}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {relationship.constraint_name ?? "Unnamed relationship"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {relationship.column_mappings.map((mapping) => (
                    <div
                      key={`${mapping.source_column}-${mapping.target_column}`}
                      className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-start gap-2 rounded bg-muted/40 px-2.5 py-2 text-xs"
                    >
                      <span className="break-all font-mono leading-5">
                        {formatRelationshipColumnReference(
                          relationship.source_schema_name,
                          relationship.source_table_name,
                          mapping.source_column,
                        )}
                      </span>
                      <span className="pt-0.5 text-center text-muted-foreground">→</span>
                      <span className="break-all font-mono leading-5">
                        {formatRelationshipColumnReference(
                          relationship.target_schema_name,
                          relationship.target_table_name,
                          mapping.target_column,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MetadataSection({ metadata }: { metadata: TableMetadataInfo }) {
  const hasMetadata =
    metadata.indexes.length > 0 ||
    metadata.constraints.length > 0 ||
    metadata.enums.length > 0 ||
    metadata.properties.length > 0;

  if (!hasMetadata) {
    return (
      <EmptyState
        title="No metadata available"
        description="This connection did not return additional index, constraint, enum, or engine metadata for the selected table."
      />
    );
  }

  return (
    <div className="space-y-4">
      {metadata.indexes.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Indexes" description="How this table is optimized for lookups." />
          <div className="overflow-hidden rounded-md border bg-card">
            {metadata.indexes.map((index) => (
              <div key={index.name} className="space-y-2 border-b p-3 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{index.name}</span>
                  {index.is_primary && (
                    <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[11px] font-medium">
                      Primary
                    </span>
                  )}
                  {index.is_unique && (
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium">
                      Unique
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(index.columns.length > 0 ? index.columns.join(", ") : "Expression index") +
                    (index.method ? ` • ${index.method}` : "")}
                </div>
                {index.definition && (
                  <div className="overflow-x-auto rounded bg-muted/40 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                    {index.definition}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {metadata.constraints.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Constraints"
            description="Integrity rules enforced by the database."
          />
          <div className="overflow-hidden rounded-md border bg-card">
            {metadata.constraints.map((constraint) => (
              <div
                key={`${constraint.kind}-${constraint.name}`}
                className="space-y-2 border-b p-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{constraint.name}</span>
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium capitalize">
                    {constraint.kind.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {describeConstraint(constraint)}
                </div>
                {constraint.definition && (
                  <div className="overflow-x-auto rounded bg-muted/40 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                    {constraint.definition}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {metadata.enums.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Enums" description="Columns bound to enumerated values." />
          <div className="overflow-hidden rounded-md border bg-card">
            {metadata.enums.map((enumInfo) => (
              <div
                key={`${enumInfo.column_name}-${enumInfo.enum_schema_name}.${enumInfo.enum_name}`}
                className="space-y-2 border-b p-3 last:border-b-0"
              >
                <div className="text-sm font-medium">
                  {enumInfo.column_name}{" "}
                  <span className="text-muted-foreground">
                    ({enumInfo.enum_schema_name}.{enumInfo.enum_name})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {enumInfo.values.map((value) => (
                    <span key={value} className="rounded bg-muted px-2 py-1 text-xs">
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {metadata.properties.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Properties" description="Database-specific table settings." />
          <div className="overflow-hidden rounded-md border bg-card">
            {metadata.properties.map((property) => (
              <div
                key={property.label}
                className="flex items-start justify-between gap-4 border-b px-3 py-2 last:border-b-0"
              >
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {property.label}
                </div>
                <div className="text-right text-sm font-medium">{property.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ErdSection({ erd }: { erd: TableErdInfo }) {
  if (erd.tables.length <= 1 && erd.edges.length === 0) {
    return (
      <EmptyState
        title="No ERD edges to draw"
        description="The selected table has no direct relationships, so the diagram stays focused on the table structure alone."
      />
    );
  }

  return <TableExplorerErdCanvas erd={erd} />;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" className="space-y-3 rounded-lg border p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">Unable to load table details</div>
          <div className="mt-1 text-sm text-muted-foreground">{message}</div>
          <button
            onClick={onRetry}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-input px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function describeConstraint(constraint: TableConstraintInfo): string {
  const columns = constraint.columns.join(", ") || "No columns";
  const reference =
    constraint.referenced_table_name && constraint.referenced_schema_name
      ? ` → ${constraint.referenced_schema_name}.${constraint.referenced_table_name} (${constraint.referenced_columns.join(", ") || "—"})`
      : "";
  return `${columns}${reference}`;
}

function formatRelationshipColumnReference(
  schemaName: string,
  tableName: string,
  columnName: string,
): string {
  return `${schemaName}.${tableName}.${columnName}`;
}
