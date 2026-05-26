import { useState } from "react";
import type { TableExplorerTabId } from "../types";
import { TableExplorerView } from "./TableExplorerView";

interface TableDetailViewProps {
  schemaName: string;
  tableName: string;
  connectionId: string;
  onPreviewQuery: (sql: string) => void;
}

export function TableDetailView({
  schemaName,
  tableName,
  connectionId,
  onPreviewQuery,
}: TableDetailViewProps) {
  const [activeSection, setActiveSection] = useState<TableExplorerTabId>("schema");

  return (
    <TableExplorerView
      connectionId={connectionId}
      connectionName={connectionId}
      schemaName={schemaName}
      tableName={tableName}
      activeSection={activeSection}
      onChangeSection={setActiveSection}
      onPreviewQuery={onPreviewQuery}
    />
  );
}
