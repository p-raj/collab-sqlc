import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/domains/auth/hooks/use-auth-store";
import { useConnectionsStore } from "@/domains/connections/hooks/use-connections-store";
import { useSavedQueriesStore } from "@/domains/queries/hooks/use-saved-queries-store";
import { Dialog } from "@/shared/components/Dialog";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { KeyboardShortcutsModal } from "@/shared/components/KeyboardShortcutsModal";
import { useKeyboardShortcuts } from "@/shared/hooks/use-keyboard-shortcuts";
import { getShortcutSpec } from "@/shared/keyboard-shortcuts";
import type { PanelId } from "../panel-registry";
import { IconRail } from "@/layouts/IconRail";
import { useWorkspaceSavedQueryActions } from "@/workspace/use-workspace-saved-query-actions";
import type { ShortcutDef } from "@/shared/hooks/use-keyboard-shortcuts";
import { useEditorContext, EditorProvider } from "../hooks/editor-context";
import { EditorSavedQueryActionsProvider } from "../hooks/editor-saved-query-context";
import { createTab } from "../hooks/editor-reducer";
import { getSelectedConnectionId, shouldSyncActiveConnection } from "../utils/selected-connection";
import { EditorSidePanel } from "./EditorSidePanel";
import { TabBar } from "./TabBar";

const AdminPage = lazy(() => import("@/domains/admin/components/AdminPage"));
const NEW_TAB_SHORTCUT = getShortcutSpec("new-tab");
const CLOSE_TAB_SHORTCUT = getShortcutSpec("close-tab");
const TAB_SWITCH_SHORTCUTS = [
    getShortcutSpec("switch-tab-1"),
    getShortcutSpec("switch-tab-2"),
    getShortcutSpec("switch-tab-3"),
    getShortcutSpec("switch-tab-4"),
    getShortcutSpec("switch-tab-5"),
    getShortcutSpec("switch-tab-6"),
] as const;
const TOGGLE_SIDEBAR_SHORTCUT = getShortcutSpec("toggle-sidebar");
const SHOW_SHORTCUTS_SHORTCUT = getShortcutSpec("show-shortcuts");
const OPEN_SEARCH_SHORTCUT = getShortcutSpec("open-search");

function EditorWorkspaceContent() {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const {
        load: loadConnections,
        connections,
        activeConnectionId,
        setActive,
    } = useConnectionsStore();
    const { loadAll: loadSavedQueries } = useSavedQueriesStore();
    const {
        state,
        dispatch,
        activeTab,
        handleCloseTab,
        handleReplayQuery,
        handleOpenSchemaTab,
        handleGenerateSelect,
    } = useEditorContext();
    const {
        folders,
        handleOpenQuery,
        handleSaveQuery,
        handleSaveQueryAs,
        handleMoveToFolder,
    } = useWorkspaceSavedQueryActions({ state, dispatch, activeTab });
    const selectedConnectionId = getSelectedConnectionId(activeTab?.connectionId, activeConnectionId);
    const assistantConnection =
        connections.find(
            (connection) => connection.id === selectedConnectionId,
        ) ?? null;

    const [activePanelId, setActivePanelId] = useState<PanelId | null>("schema");
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showAdmin, setShowAdmin] = useState(false);

    useEffect(() => {
        loadConnections();
        loadSavedQueries();
    }, [loadConnections, loadSavedQueries]);

    useEffect(() => {
        if (!selectedConnectionId) {
            return;
        }

        if (shouldSyncActiveConnection(
            selectedConnectionId,
            activeConnectionId,
            connections.map((connection) => connection.id),
        )) {
            setActive(selectedConnectionId);
        }
    }, [activeConnectionId, connections, selectedConnectionId, setActive]);

    const handlePanelToggle = useCallback((panelId: PanelId) => {
        setActivePanelId((previous) => (previous === panelId ? null : panelId));
    }, []);

    const handleLogout = useCallback(async () => {
        await logout();
        navigate("/login", { replace: true });
    }, [logout, navigate]);

    const handleAdmin = useCallback(() => {
        setShowAdmin((previous) => !previous);
    }, []);

    const handleAddTab = useCallback(() => {
        dispatch({ type: "ADD_TAB", tab: createTab(selectedConnectionId ?? null) });
    }, [dispatch, selectedConnectionId]);

    const handleSidePanelReplayQuery = useCallback((sql: string) => {
        handleReplayQuery(sql, selectedConnectionId);
    }, [handleReplayQuery, selectedConnectionId]);

    const handleSidePanelOpenSchemaTab = useCallback((schemaName: string, tableName: string, objectId?: string) => {
        handleOpenSchemaTab(schemaName, tableName, objectId, selectedConnectionId);
    }, [handleOpenSchemaTab, selectedConnectionId]);

    const handleSidePanelGenerateSelect = useCallback((schemaName: string, tableName: string, objectId?: string) => {
        void handleGenerateSelect(schemaName, tableName, objectId, selectedConnectionId);
    }, [handleGenerateSelect, selectedConnectionId]);

    const shortcuts = useMemo<ShortcutDef[]>(
        () => [
            {
                ...NEW_TAB_SHORTCUT.binding,
                handler: handleAddTab,
            },
            {
                ...CLOSE_TAB_SHORTCUT.binding,
                handler: () => {
                    void handleCloseTab(state.activeTabId);
                },
            },
            ...TAB_SWITCH_SHORTCUTS.map((shortcut, index) => ({
                ...shortcut.binding,
                handler: () => {
                    const tab = state.tabs[index];
                    if (tab) {
                        dispatch({ type: "SET_ACTIVE_TAB", tabId: tab.id });
                    }
                },
            })),
            {
                ...TOGGLE_SIDEBAR_SHORTCUT.binding,
                handler: () => setActivePanelId((previous) => (previous ? null : "schema")),
            },
            {
                ...SHOW_SHORTCUTS_SHORTCUT.binding,
                handler: () => setShowShortcuts((previous) => !previous),
            },
            {
                ...OPEN_SEARCH_SHORTCUT.binding,
                handler: () => handlePanelToggle("search"),
            },
        ],
        [dispatch, handleAddTab, handleCloseTab, handlePanelToggle, state.activeTabId, state.tabs],
    );

    useKeyboardShortcuts(shortcuts);

    return (
        <EditorSavedQueryActionsProvider
            value={{ folders, handleSaveQuery, handleSaveQueryAs, handleMoveToFolder }}
        >
            <div className="flex h-screen flex-col">
                <TabBar
                    tabs={state.tabs}
                    activeTabId={state.activeTabId}
                    onSelect={(tabId) => dispatch({ type: "SET_ACTIVE_TAB", tabId })}
                    onClose={handleCloseTab}
                    onAdd={handleAddTab}
                />

                <div className="flex flex-1 overflow-hidden">
                    <IconRail
                        activePanelId={activePanelId}
                        onPanelToggle={handlePanelToggle}
                        user={user}
                        onLogout={handleLogout}
                        onAdmin={handleAdmin}
                        isAdminActive={showAdmin}
                        onShowShortcuts={() => setShowShortcuts(true)}
                    />
                    <ErrorBoundary>
                        <EditorSidePanel
                            activePanelId={activePanelId}
                            connectionId={selectedConnectionId}
                            connectionName={assistantConnection?.name ?? null}
                            assistantConnectionDbml={assistantConnection?.dbml_context ?? null}
                            onApplySql={(sql) => {
                                if (!activeTab) return;
                                dispatch({ type: "UPDATE_SQL", tabId: activeTab.id, sql });
                            }}
                            onOpenQuery={handleOpenQuery}
                            onReplayQuery={handleSidePanelReplayQuery}
                            onOpenSchemaTab={handleSidePanelOpenSchemaTab}
                            onGenerateSelect={handleSidePanelGenerateSelect}
                        />
                    </ErrorBoundary>
                    <main className="flex flex-1 flex-col overflow-hidden">
                        <ErrorBoundary>
                            <Outlet />
                        </ErrorBoundary>
                    </main>
                </div>

                {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

                {showAdmin && (
                    <Dialog title="Admin Settings" onClose={() => setShowAdmin(false)}>
                        <Suspense
                            fallback={
                                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
                            }
                        >
                            <AdminPage />
                        </Suspense>
                    </Dialog>
                )}
            </div>
        </EditorSavedQueryActionsProvider>
    );
}

export function EditorWorkspaceLayout() {
    const activeConnection = useConnectionsStore((store) => store.getActive());

    return (
        <EditorProvider
            activeConnectionId={activeConnection?.id ?? null}
        >
            <EditorWorkspaceContent />
        </EditorProvider>
    );
}
