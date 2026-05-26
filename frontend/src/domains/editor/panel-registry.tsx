import {
  Activity,
  Bot,
  Clock,
  Database,
  FolderOpen,
  Globe,
  Search,
  type LucideIcon,
} from "lucide-react";
import { AssistantPanel } from "@/domains/assistant/components/AssistantPanel";
import { ConnectionsPanel } from "@/domains/connections/components/ConnectionsPanel";
import { RunHistoryPanel } from "@/domains/history/components/RunHistoryPanel";
import { APIQueriesPanel } from "@/domains/query-api/components/APIQueriesPanel";
import { ExecutionLogsPanel } from "@/domains/query-api/components/ExecutionLogsPanel";
import { SavedQueriesPanel } from "@/domains/queries/components/SavedQueriesPanel";
import type { SavedQuery } from "@/domains/queries/types";
import { SearchPanel } from "@/domains/search/components/SearchPanel";
import { SchemaTree } from "@/domains/schema/components/SchemaTree";

export interface WorkspacePanelRenderProps {
  connectionId: string | null;
  assistantConnectionDbml: Record<string, unknown> | null;
  onApplySql: (sql: string) => void;
  onOpenQuery: (query: SavedQuery) => void;
  onReplayQuery: (sql: string) => void;
  onOpenSchemaTab: (schemaName: string, tableName: string) => void;
  onGenerateSelect: (schemaName: string, tableName: string) => void;
}

export interface WorkspacePanelDefinition {
  id: string;
  title: string;
  icon: LucideIcon;
  showConnectionName: boolean;
  render: (props: WorkspacePanelRenderProps) => React.ReactNode;
}

export const WORKSPACE_PANELS = [
  {
    id: "search",
    title: "Search",
    icon: Search,
    showConnectionName: true,
    render: ({ connectionId, onOpenQuery, onOpenSchemaTab }) => (
      <SearchPanel
        connectionId={connectionId}
        onOpenQuery={onOpenQuery}
        onSelectTable={onOpenSchemaTab}
      />
    ),
  },
  {
    id: "schema",
    title: "Schema",
    icon: Database,
    showConnectionName: true,
    render: ({ connectionId, onOpenSchemaTab, onGenerateSelect }) => (
      <SchemaTree
        connectionId={connectionId}
        onSelectTable={onOpenSchemaTab}
        onGenerateSelect={onGenerateSelect}
      />
    ),
  },
  {
    id: "queries",
    title: "Saved Queries",
    icon: FolderOpen,
    showConnectionName: true,
    render: ({ onOpenQuery }) => <SavedQueriesPanel onOpenQuery={onOpenQuery} />,
  },
  {
    id: "history",
    title: "Run History",
    icon: Clock,
    showConnectionName: true,
    render: ({ connectionId, onReplayQuery }) => (
      <RunHistoryPanel connectionId={connectionId} onReplayQuery={onReplayQuery} />
    ),
  },
  {
    id: "api-queries",
    title: "API Queries",
    icon: Globe,
    showConnectionName: true,
    render: ({ onOpenQuery }) => <APIQueriesPanel onOpenQuery={onOpenQuery} />,
  },
  {
    id: "api-logs",
    title: "API Execution Logs",
    icon: Activity,
    showConnectionName: true,
    render: () => <ExecutionLogsPanel />,
  },
  {
    id: "assistant",
    title: "SQL Assistant",
    icon: Bot,
    showConnectionName: true,
    render: ({ assistantConnectionDbml, onApplySql }) => (
      <AssistantPanel
        connectionDbml={assistantConnectionDbml}
        onApplySql={onApplySql}
      />
    ),
  },
  {
    id: "connections",
    title: "Connections",
    icon: Database,
    showConnectionName: false,
    render: () => <ConnectionsPanel />,
  },
] as const satisfies readonly WorkspacePanelDefinition[];

export type PanelId = (typeof WORKSPACE_PANELS)[number]["id"];

const WORKSPACE_PANEL_MAP: Record<PanelId, (typeof WORKSPACE_PANELS)[number]> =
  Object.fromEntries(
    WORKSPACE_PANELS.map((panel) => [panel.id, panel]),
  ) as Record<PanelId, (typeof WORKSPACE_PANELS)[number]>;

export function getWorkspacePanel(panelId: PanelId) {
  return WORKSPACE_PANEL_MAP[panelId];
}
