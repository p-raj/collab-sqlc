import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useConnectionsStore } from "@/domains/connections/hooks/use-connections-store";
import { useSavedQueriesStore } from "@/domains/queries/hooks/use-saved-queries-store";
import type { SavedQuery } from "@/domains/queries/types";
import { buildFolderLookup, getFolderName } from "@/domains/queries/utils/saved-query-path";
import { createTab } from "@/domains/editor/hooks/editor-reducer";
import type { EditorAction, EditorState, Tab } from "@/domains/editor/types";

interface UseWorkspaceSavedQueryActionsArgs {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  activeTab: Tab | undefined;
}

export function useWorkspaceSavedQueryActions({
  state,
  dispatch,
  activeTab,
}: UseWorkspaceSavedQueryActionsArgs) {
  const activeConnection = useConnectionsStore((store) => store.getActive());
  const savedQueriesStore = useSavedQueriesStore();
  const folderById = useMemo(
    () => buildFolderLookup(savedQueriesStore.folders),
    [savedQueriesStore.folders],
  );

  const handleOpenQuery = useCallback(
    (query: SavedQuery) => {
      const matchingTabs = state.tabs.filter((tab) => tab.savedQueryId === query.id);
      if (matchingTabs.length > 0) {
        const currentIndex = matchingTabs.findIndex((tab) => tab.id === state.activeTabId);
        const nextTab = matchingTabs[(currentIndex + 1) % matchingTabs.length] ?? matchingTabs[0];
        if (!nextTab) return;
        dispatch({ type: "SET_ACTIVE_TAB", tabId: nextTab.id });
        return;
      }

      const tab = createTab(query.connection_id ?? activeConnection?.id ?? null);
      const folderName = getFolderName(query.folder_id, folderById);
      dispatch({ type: "ADD_TAB", tab });
      dispatch({ type: "UPDATE_SQL", tabId: tab.id, sql: query.sql });
      dispatch({ type: "RENAME_TAB", tabId: tab.id, title: query.title });
      dispatch({
        type: "LINK_SAVED_QUERY",
        tabId: tab.id,
        savedQueryId: query.id,
        folderName,
      });
      if (query.api_enabled) {
        dispatch({ type: "SET_API_ENABLED", tabId: tab.id, enabled: true });
      }
      dispatch({ type: "MARK_SAVED", tabId: tab.id });
    },
    [activeConnection, dispatch, folderById, state.activeTabId, state.tabs],
  );

  const handleSaveQuery = useCallback(async () => {
    if (!activeTab) return;

    if (!activeTab.savedQueryId) {
      toast("Use Save As to save a new query", {
        description: "This query hasn't been saved yet.",
      });
      return;
    }

    try {
      await savedQueriesStore.updateQuery(activeTab.savedQueryId, {
        sql: activeTab.sql,
        title: activeTab.title,
      });
      dispatch({ type: "MARK_SAVED", tabId: activeTab.id });
      toast.success("Query saved");
    } catch {
      toast.error("Failed to save query");
    }
  }, [activeTab, dispatch, savedQueriesStore]);

  const handleSaveQueryAs = useCallback(
    async (title: string, description?: string, folderId?: string | null, isShared?: boolean) => {
      if (!activeTab) return;

      const connectionId = activeTab.connectionId ?? activeConnection?.id ?? null;
      const folderName = getFolderName(folderId ?? null, folderById);

      try {
        const saved = await savedQueriesStore.saveQuery({
          title,
          sql: activeTab.sql,
          description: description || null,
          connection_id: connectionId,
          folder_id: folderId ?? null,
          is_shared: isShared ?? false,
        });
        dispatch({ type: "RENAME_TAB", tabId: activeTab.id, title });
        dispatch({
          type: "LINK_SAVED_QUERY",
          tabId: activeTab.id,
          savedQueryId: saved.id,
          folderName,
        });
        dispatch({ type: "MARK_SAVED", tabId: activeTab.id });
        toast.success("Query saved", { description: title });
      } catch {
        toast.error("Failed to save query");
      }
    },
    [activeConnection, activeTab, dispatch, folderById, savedQueriesStore],
  );

  const handleMoveToFolder = useCallback(
    async (folderId: string | null) => {
      if (!activeTab?.savedQueryId) return;

      try {
        await savedQueriesStore.updateQuery(activeTab.savedQueryId, { folder_id: folderId });
        const folderName = getFolderName(folderId, folderById);
        dispatch({
          type: "LINK_SAVED_QUERY",
          tabId: activeTab.id,
          savedQueryId: activeTab.savedQueryId,
          folderName,
        });
        toast.success(folderId ? `Moved to ${folderName}` : "Moved to root");
      } catch {
        toast.error("Failed to move query");
      }
    },
    [activeTab, dispatch, folderById, savedQueriesStore],
  );

  return {
    folders: savedQueriesStore.folders.map((folder) => ({ id: folder.id, name: folder.name })),
    handleOpenQuery,
    handleSaveQuery,
    handleSaveQueryAs,
    handleMoveToFolder,
  };
}
