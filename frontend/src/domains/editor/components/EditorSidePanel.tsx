import type { SavedQuery } from "@/domains/queries/types";
import {
    getWorkspacePanel,
    type PanelId,
} from "../panel-registry";

interface EditorSidePanelProps {
    activePanelId: PanelId | null;
    connectionId: string | null;
    connectionName: string | null;
    assistantConnectionDbml: Record<string, unknown> | null;
    onApplySql: (sql: string) => void;
    onOpenQuery: (query: SavedQuery) => void;
    onReplayQuery: (sql: string) => void;
    onOpenSchemaTab: (schemaName: string, tableName: string) => void;
    onGenerateSelect: (schemaName: string, tableName: string) => void;
}

export function EditorSidePanel({
    activePanelId,
    connectionId,
    connectionName,
    assistantConnectionDbml,
    onApplySql,
    onOpenQuery,
    onReplayQuery,
    onOpenSchemaTab,
    onGenerateSelect,
}: EditorSidePanelProps) {
    const activePanel = activePanelId ? getWorkspacePanel(activePanelId) : null;

    return (
        <div
            className={`flex flex-col overflow-hidden border-r bg-card transition-all duration-200 ${activePanelId ? "w-60" : "w-0"
                }`}
        >
            {activePanel && (
                <>
                    <div className="flex h-9 items-center border-b px-3 gap-2">
                        <span className="text-xs font-semibold tracking-tight">{activePanel.title}</span>
                        {connectionName && activePanel.showConnectionName && (
                            <span className="text-[0.75rem] text-muted-foreground truncate" title={connectionName}>
                                · {connectionName}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {activePanel.render({
                            connectionId,
                            assistantConnectionDbml,
                            onApplySql,
                            onOpenQuery,
                            onReplayQuery,
                            onOpenSchemaTab,
                            onGenerateSelect,
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
