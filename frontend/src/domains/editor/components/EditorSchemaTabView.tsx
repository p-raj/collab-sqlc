import type { TableExplorerTabId } from "@/domains/schema/types";
import { TableExplorerView } from "@/domains/schema/components/TableExplorerView";

interface EditorSchemaTabViewProps {
  connectionId: string;
  connectionName: string;
  schemaName: string;
  tableName: string;
  objectId?: string;
  activeSection: TableExplorerTabId;
  onChangeSection: (section: TableExplorerTabId) => void;
  onPreviewQuery: (sql: string) => void;
}

export function EditorSchemaTabView(props: EditorSchemaTabViewProps) {
  return <TableExplorerView {...props} />;
}
