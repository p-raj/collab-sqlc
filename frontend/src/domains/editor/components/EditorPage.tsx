import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import type { editor } from "monaco-editor";
import { getDatabaseEngine } from "@/domains/connections/engine-registry";
import { useConnectionsStore } from "@/domains/connections/hooks/use-connections-store";
import { useSavedQueriesStore } from "@/domains/queries/hooks/use-saved-queries-store";
import { useQueryApiCapability } from "@/domains/query-api/hooks/use-query-api-capability";
import { useSchemaStore } from "@/domains/schema/hooks/use-schema-store";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import { extractActiveSql } from "@/domains/editor/utils/active-sql";
import { useKeyboardShortcuts } from "@/shared/hooks/use-keyboard-shortcuts";
import { getShortcutSpec } from "@/shared/keyboard-shortcuts";
import { useEditorContext } from "../hooks/editor-context";
import { useEditorSavedQueryActions } from "../hooks/editor-saved-query-context";
import { EditorSchemaTabView } from "./EditorSchemaTabView";
import { SqlEditor } from "./SqlEditor";
import { ResultsArea } from "./ResultsArea";
import { ResizeHandle } from "./ResizeHandle";
import { QueryHeader } from "./QueryHeader";
import { VariableBar } from "./VariableBar";
import type { ShortcutDef } from "@/shared/hooks/use-keyboard-shortcuts";
import type { TableInfo } from "@/domains/schema/types";

const MIN_SPLIT = 20;
const MAX_SPLIT = 80;
const DEFAULT_SPLIT = 60;
const FOCUS_EDITOR_SHORTCUT = getShortcutSpec("focus-editor");
const EMPTY_TABLES: TableInfo[] = [];

export default function EditorPage() {
  const {
    state,
    dispatch,
    activeTab,
    handleExecute,
    handleExplain,
    handleCancel,
    handleFormatSql,
    handleReplayQuery,
    backendPid,
    runningConnectionDbType,
  } = useEditorContext();
  const { folders, handleSaveQuery, handleSaveQueryAs, handleMoveToFolder } =
    useEditorSavedQueryActions();
  const { connections, activeConnectionId, isLoading: connectionsLoading } = useConnectionsStore();
  const refreshSavedQueries = useSavedQueriesStore((store) => store.loadAll);
  const user = useAuthStore((s) => s.user);
  const canToggleWriteMode = user?.role === "admin" || user?.role === "editor";
  const canManageApi = canToggleWriteMode;
  const containerRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT);
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const shortcuts = useMemo<ShortcutDef[]>(
    () => [
      {
        ...FOCUS_EDITOR_SHORTCUT.binding,
        handler: () => {
          editorInstanceRef.current?.focus();
        },
      },
    ],
    [],
  );

  useKeyboardShortcuts(shortcuts);

  const getRunnableSqlFromEditor = useCallback(() => {
    const ed = editorInstanceRef.current;
    const model = ed?.getModel();
    const selection = ed?.getSelection();
    const position = ed?.getPosition();
    if (!ed || !model || !position) return undefined;

    return extractActiveSql(
      model.getValue(),
      model.getOffsetAt(position),
      selection && !selection.isEmpty()
        ? {
            startOffset: model.getOffsetAt(selection.getStartPosition()),
            endOffset: model.getOffsetAt(selection.getEndPosition()),
          }
        : null,
    );
  }, []);

  const handleResizeDrag = useCallback((deltaY: number) => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.getBoundingClientRect().height;
    if (containerHeight === 0) return;
    const deltaPercent = (deltaY / containerHeight) * 100;
    setSplitPercent((prev) => Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, prev + deltaPercent)));
  }, []);

  const handleRunClick = useCallback(() => {
    void handleExecute(getRunnableSqlFromEditor());
  }, [getRunnableSqlFromEditor, handleExecute]);

  const handleExplainClick = useCallback(() => {
    void handleExplain(getRunnableSqlFromEditor());
  }, [getRunnableSqlFromEditor, handleExplain]);

  const handleEditorReady = useCallback((instance: editor.IStandaloneCodeEditor) => {
    editorInstanceRef.current = instance;
  }, []);

  const selectedConnectionId = activeTab?.connectionId ?? activeConnectionId;
  const fetchSchema = useSchemaStore((store) => store.fetchSchema);
  const completionTables = useSchemaStore((store) =>
    selectedConnectionId
      ? (store.schemas[selectedConnectionId]?.tables ?? EMPTY_TABLES)
      : EMPTY_TABLES,
  );
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const queryHeaderConnectionDbType = state.isExecuting
    ? (runningConnectionDbType ?? selectedConnection?.db_type ?? null)
    : (selectedConnection?.db_type ?? null);
  useEffect(() => {
    if (selectedConnectionId) {
      void fetchSchema(selectedConnectionId);
    }
  }, [fetchSchema, selectedConnectionId]);

  const queryApiCapability = useQueryApiCapability({
    activeTab,
    dispatch,
    refreshSavedQueries,
    canManageApi,
  });

  const handleConnectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!activeTab) return;
    const connId = e.target.value;
    dispatch({ type: "SET_CONNECTION", tabId: activeTab.id, connectionId: connId });
  };

  // Schema view mode
  if (activeTab?.schemaView && activeTab.connectionId) {
    return (
      <EditorSchemaTabView
        connectionId={activeTab.connectionId}
        schemaName={activeTab.schemaView.schemaName}
        tableName={activeTab.schemaView.tableName}
        connectionName={selectedConnection?.name ?? activeTab.connectionId}
        activeSection={activeTab.schemaView.activeSection}
        onChangeSection={(section) =>
          dispatch({ type: "SET_SCHEMA_SECTION", tabId: activeTab.id, section })
        }
        onPreviewQuery={handleReplayQuery}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Row 1: [Connection] [Read/Write] [Hosted URL] */}
      <div className="flex h-9 items-center gap-2 border-b bg-card px-3">
        <div className="relative flex items-center">
          {selectedConnectionId && (
            <span
              className={`pointer-events-none absolute left-2 h-2 w-2 rounded-full ${
                getDatabaseEngine(connections.find((c) => c.id === selectedConnectionId)?.db_type)
                  .dotColorClass
              }`}
            />
          )}
          <select
            value={selectedConnectionId ?? ""}
            onChange={handleConnectionChange}
            disabled={connectionsLoading}
            className="h-6 appearance-none rounded border border-input bg-transparent pl-5 pr-6 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>
              {connectionsLoading ? "Loading..." : "Select connection..."}
            </option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.database})
              </option>
            ))}
          </select>
        </div>

        {canToggleWriteMode && activeTab && (
          <button
            onClick={() => dispatch({ type: "TOGGLE_WRITE_MODE", tabId: activeTab.id })}
            className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-xs transition-colors ${
              activeTab.writeMode
                ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-input text-muted-foreground hover:bg-accent"
            }`}
            title={
              activeTab.writeMode
                ? "Write mode ON — click to switch to read-only"
                : "Read-only mode — click to enable write mode"
            }
          >
            {activeTab.writeMode ? <LockOpen size={12} /> : <Lock size={12} />}
            {activeTab.writeMode ? "Write" : "Read-only"}
          </button>
        )}

        {queryApiCapability.hostedEndpointChip}
      </div>

      {/* Row 2: [Name] [...] ─── [Run] [Format] [Save] */}
      <QueryHeader
        isExecuting={state.isExecuting}
        hasSelection={hasSelection}
        backendPid={backendPid}
        showSavePopover={showSavePopover}
        onShowSavePopover={setShowSavePopover}
        onRun={handleRunClick}
        onExplain={handleExplainClick}
        onCancel={() => void handleCancel()}
        onFormat={() => void handleFormatSql()}
        connectionId={selectedConnectionId}
        connectionDbType={queryHeaderConnectionDbType}
        folders={folders}
        onSave={() => {
          if (activeTab?.savedQueryId) {
            void handleSaveQuery();
          } else {
            setShowSavePopover(true);
          }
        }}
        onSaveAs={(title, description, folderId, isShared) => {
          void handleSaveQueryAs(title, description, folderId, isShared);
        }}
        onMoveToFolder={(folderId) => {
          void handleMoveToFolder(folderId);
        }}
        renderSaveMenuItems={queryApiCapability.renderQueryHeaderSaveMenuItems}
        renderMoreMenuItems={queryApiCapability.renderQueryHeaderMoreMenuItems}
      />

      <VariableBar
        isConfigOpen={queryApiCapability.isConfigOpen}
        canManageApi={canManageApi}
        onOpenConfig={queryApiCapability.openConfig}
      />

      <div className="flex flex-1 overflow-hidden">
        <div ref={containerRef} className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="overflow-hidden" style={{ height: `${splitPercent}%` }}>
            {activeTab && (
              <SqlEditor
                value={activeTab.sql}
                onChange={(sql) => dispatch({ type: "UPDATE_SQL", tabId: activeTab.id, sql })}
                onExecute={(sqlOverride) => void handleExecute(sqlOverride)}
                onExplain={(sqlOverride) => void handleExplain(sqlOverride)}
                onFormat={() => void handleFormatSql()}
                onSave={() => {
                  if (activeTab.savedQueryId) {
                    void handleSaveQuery();
                  } else {
                    setShowSavePopover(true);
                  }
                }}
                onSaveAs={() => {
                  setShowSavePopover(true);
                }}
                completionTables={completionTables}
                dbType={selectedConnection?.db_type ?? null}
                onEditorReady={handleEditorReady}
                onSelectionChange={setHasSelection}
                errorPosition={activeTab.errorPosition}
                errorMessage={activeTab.error}
              />
            )}
          </div>

          <ResizeHandle onDrag={handleResizeDrag} />

          <div className="overflow-hidden" style={{ height: `${100 - splitPercent}%` }}>
            <ResultsArea />
          </div>
        </div>

        {queryApiCapability.configPanel}
      </div>
    </div>
  );
}
