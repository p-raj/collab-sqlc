import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Play, Search, Table2 } from "lucide-react";
import { Badge } from "@/shared/components/ui/Badge";
import { Button } from "@/shared/components/ui/Button";
import { CommandCard } from "@/shared/components/ui/CommandCard";
import {
  EmptyState,
  ErrorState as SharedErrorState,
  LoadingState as SharedLoadingState,
} from "@/shared/components/ui/DataState";
import { Input } from "@/shared/components/ui/Input";
import { MetadataRow } from "@/shared/components/ui/MetadataRow";
import { Panel } from "@/shared/components/ui/Panel";
import { SectionHeader } from "@/shared/components/ui/SectionHeader";
import { TabButton, TabsRoot } from "@/shared/components/ui/Tabs";
import { getObjectDetailKey, useSchemaStore } from "../hooks/use-schema-store";
import { TableExplorerErdCanvas } from "./TableExplorerErdCanvas";
import type {
  ColumnInfo,
  ObjectSection,
  TableErdInfo,
  TableConstraintInfo,
  TableExplorerTabId,
  TableMetadataInfo,
  TableMetadataPropertyInfo,
  TableRelationshipInfo,
} from "../types";

interface TableExplorerViewProps {
  connectionId: string;
  connectionName: string;
  schemaName: string;
  tableName: string;
  objectId?: string;
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
  objectId,
  activeSection,
  onChangeSection,
  onPreviewQuery,
}: TableExplorerViewProps) {
  const [filter, setFilter] = useState("");
  const tableDetailKey = `${connectionId}:${schemaName}:${tableName}`;
  const fetchTableDetail = useSchemaStore((store) => store.fetchTableDetail);
  const fetchObjectDetail = useSchemaStore((store) => store.fetchObjectDetail);
  const detail = useSchemaStore((store) => store.tableDetails[tableDetailKey] ?? null);
  const objectDetail = useSchemaStore((store) =>
    objectId ? (store.objectDetails[getObjectDetailKey(connectionId, objectId)] ?? null) : null,
  );
  const error = useSchemaStore((store) => store.tableDetailErrors[tableDetailKey] || null);
  const objectError = useSchemaStore((store) =>
    objectId ? store.objectDetailErrors[getObjectDetailKey(connectionId, objectId)] || null : null,
  );

  useEffect(() => {
    if (objectId) {
      void fetchObjectDetail(connectionId, objectId);
    } else {
      void fetchTableDetail(connectionId, schemaName, tableName);
    }
  }, [connectionId, fetchObjectDetail, fetchTableDetail, objectId, schemaName, tableName]);

  useEffect(() => {
    setFilter("");
  }, [activeSection, connectionId, schemaName, tableName]);

  const table = objectDetail?.sections.find((section) => section.kind === "attributes")
    ? {
        columns:
          objectDetail.sections.find((section) => section.kind === "attributes")?.columns ?? [],
        comment: null,
        row_count: null,
      }
    : (detail?.table ?? null);
  const activeObjectSection =
    objectDetail?.sections.find((section) => section.id === activeSection) ??
    objectDetail?.sections[0] ??
    null;
  const previewText =
    objectDetail?.preview_operation.text ??
    `SELECT * FROM "${schemaName}"."${tableName}" LIMIT 100`;
  const previewLabel = objectDetail?.preview_operation.label ?? "Preview";
  const objectKindLabel = objectDetail?.object.kind === "key" ? "key" : "table";
  const objectDescription =
    objectDetail?.object.kind === "key"
      ? "Explore key metadata and starter read commands for this Redis key."
      : objectDetail
        ? "Explore object metadata, attributes, indexes, and starter operations."
        : (detail?.table.comment ??
          "Explore structure, relationships, metadata, and the local ERD for this table.");

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
            {objectDetail && <Badge className="uppercase tracking-wide">{objectKindLabel}</Badge>}
          </div>
          <Button
            onClick={() => onPreviewQuery(previewText)}
            variant="primary"
            size="md"
            leftIcon={<Play size={12} />}
          >
            {previewLabel}
          </Button>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          {objectDescription}
          {detail?.table.row_count != null && (
            <span className="ml-2 text-xs">~{detail.table.row_count.toLocaleString()} rows</span>
          )}
        </p>

        <TabsRoot
          role="tablist"
          aria-label="Table explorer sections"
          className="mb-5 gap-4 border-b"
        >
          {(objectDetail?.sections.map((section) => ({ id: section.id, label: section.title })) ??
            EXPLORER_TABS
          ).map((tab) => (
            <TabButton
              key={tab.id}
              role="tab"
              aria-selected={(activeObjectSection?.id ?? activeSection) === tab.id}
              active={(activeObjectSection?.id ?? activeSection) === tab.id}
              onClick={() => onChangeSection(tab.id)}
              className="h-auto pb-2 text-sm"
            >
              {tab.label}
            </TabButton>
          ))}
        </TabsRoot>

        {!objectId && !detail && error && (
          <ErrorState
            message={error}
            onRetry={() => void fetchTableDetail(connectionId, schemaName, tableName, true)}
          />
        )}
        {objectId && !objectDetail && objectError && (
          <ErrorState
            message={objectError}
            onRetry={() => void fetchObjectDetail(connectionId, objectId, true)}
          />
        )}
        {!objectId && !detail && !error && (
          <SharedLoadingState label="Loading table details" showLabel className="rounded-lg border p-4" />
        )}
        {objectId && !objectDetail && !objectError && (
          <SharedLoadingState label="Loading object details" showLabel className="rounded-lg border p-4" />
        )}

        {objectDetail && activeObjectSection && (
          <ObjectSectionView
            section={activeObjectSection}
            filter={filter}
            onFilterChange={setFilter}
            onPreviewQuery={onPreviewQuery}
          />
        )}
        {!objectDetail && detail && activeSection === "schema" && (
          <SchemaSection columns={filteredColumns} filter={filter} onFilterChange={setFilter} />
        )}
        {!objectDetail && detail && activeSection === "relationships" && (
          <RelationshipsSection
            incoming={detail.relationships.incoming}
            outgoing={detail.relationships.outgoing}
          />
        )}
        {!objectDetail && detail && activeSection === "metadata" && (
          <MetadataSection metadata={detail.metadata} />
        )}
        {!objectDetail && detail && activeSection === "erd" && <ErdSection erd={detail.erd} />}
      </div>
    </div>
  );
}

function ObjectSectionView({
  section,
  filter,
  onFilterChange,
  onPreviewQuery,
}: {
  section: ObjectSection;
  filter: string;
  onFilterChange: (value: string) => void;
  onPreviewQuery: (sql: string) => void;
}) {
  if (section.kind === "attributes") {
    return (
      <SchemaSection columns={section.columns} filter={filter} onFilterChange={onFilterChange} />
    );
  }
  if (section.kind === "relationships" && section.relationships) {
    return (
      <RelationshipsSection
        incoming={section.relationships.incoming}
        outgoing={section.relationships.outgoing}
      />
    );
  }
  if (section.kind === "erd" && section.erd) {
    return <ErdSection erd={section.erd} />;
  }
  if (section.kind === "indexes") {
    return (
      <MetadataSection
        metadata={{ indexes: section.indexes, constraints: [], enums: [], properties: [] }}
      />
    );
  }
  if (section.kind === "snippets") {
    return <SnippetsSection section={section} onPreviewQuery={onPreviewQuery} />;
  }
  return <PropertiesSection section={section} />;
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
        <Input
          type="text"
          placeholder="Type to filter columns..."
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          size="md"
          className="pl-8 text-xs"
        />
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>Columns</span>
        <Badge>{columns.length}</Badge>
      </div>

      <Panel className="overflow-x-auto rounded-md">
        <ColumnTable columns={columns} />
      </Panel>
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
                  <Badge className="bg-foreground/10 text-foreground">
                    PK
                  </Badge>
                )}
                {column.foreign_key && !column.is_primary_key && (
                  <Badge>FK</Badge>
                )}
              </span>
            </td>
            <td className="px-3 py-2">
              <Badge className="font-mono text-[11px]">
                {column.data_type}
              </Badge>
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
        <Panel className="overflow-hidden rounded-md">
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
        </Panel>
      )}
    </section>
  );
}

function PropertiesSection({ section }: { section: ObjectSection }) {
  if (section.properties.length === 0) {
    return (
      <EmptyState
        title="No details available"
        description={section.description ?? "This object did not return additional metadata."}
      />
    );
  }
  return (
    <section className="space-y-3">
      <SectionHeader
        title={section.title}
        description={section.description ?? "Object metadata returned by this engine."}
      />
      <PropertyList properties={section.properties} />
    </section>
  );
}

function SnippetsSection({
  section,
  onPreviewQuery,
}: {
  section: ObjectSection;
  onPreviewQuery: (sql: string) => void;
}) {
  if (section.snippets.length === 0) {
    return (
      <EmptyState
        title="No snippets available"
        description="This engine did not provide starter operations for the selected object."
      />
    );
  }
  return (
    <section className="space-y-3">
      <SectionHeader
        title={section.title}
        description={section.description ?? "Starter operations for the selected object."}
      />
      <div className="space-y-2">
        {section.snippets.map((snippet) => (
          <CommandCard
            key={`${snippet.label}-${snippet.text}`}
            onClick={() => onPreviewQuery(snippet.text)}
            title={snippet.label}
            command={snippet.text}
          />
        ))}
      </div>
    </section>
  );
}

function PropertyList({ properties }: { properties: TableMetadataPropertyInfo[] }) {
  return (
    <Panel className="overflow-hidden rounded-md p-2">
      {properties.map((property) => (
        <MetadataRow
          key={property.label}
          label={property.label}
          value={property.value}
          className="border-b px-1 last:border-b-0"
        />
      ))}
    </Panel>
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
          <Panel className="overflow-hidden rounded-md">
            {metadata.indexes.map((index) => (
              <div key={index.name} className="space-y-2 border-b p-3 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{index.name}</span>
                  {index.is_primary && (
                    <Badge className="bg-foreground/10 text-foreground">
                      Primary
                    </Badge>
                  )}
                  {index.is_unique && <Badge>Unique</Badge>}
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
          </Panel>
        </section>
      )}

      {metadata.constraints.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Constraints"
            description="Integrity rules enforced by the database."
          />
          <Panel className="overflow-hidden rounded-md">
            {metadata.constraints.map((constraint) => (
              <div
                key={`${constraint.kind}-${constraint.name}`}
                className="space-y-2 border-b p-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{constraint.name}</span>
                  <Badge className="capitalize">
                    {constraint.kind.replaceAll("_", " ")}
                  </Badge>
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
          </Panel>
        </section>
      )}

      {metadata.enums.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Enums" description="Columns bound to enumerated values." />
          <Panel className="overflow-hidden rounded-md">
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
                    <Badge key={value}>
                      {value}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </Panel>
        </section>
      )}

      {metadata.properties.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Properties" description="Database-specific table settings." />
          <PropertyList properties={metadata.properties} />
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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <SharedErrorState
      title="Unable to load table details"
      message={message}
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <Button onClick={onRetry} className="mt-3" size="md">
        Retry
      </Button>
    </SharedErrorState>
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
