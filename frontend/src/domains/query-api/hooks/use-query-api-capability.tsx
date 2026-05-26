import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { EditorAction, Tab } from "@/domains/editor/types";
import { HostedApiEndpointChip } from "../components/HostedApiEndpointChip";
import {
  HostedQueryMoreMenuItems,
  HostedQuerySaveMenuItems,
} from "../components/HostedQueryMenuItems";
import { QueryConfigurationPanel } from "../components/QueryConfigurationPanel";
import * as queryApiService from "../services/query-api";

interface UseQueryApiCapabilityParams {
  activeTab: Tab | undefined;
  dispatch: React.Dispatch<EditorAction>;
  refreshSavedQueries: () => Promise<void>;
  canManageApi: boolean;
}

export function useQueryApiCapability({
  activeTab,
  dispatch,
  refreshSavedQueries,
  canManageApi,
}: UseQueryApiCapabilityParams) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [hostedConnectionId, setHostedConnectionId] = useState<string | null>(null);
  const activeTabId = activeTab?.id;
  const activeTabApiEnabled = activeTab?.apiEnabled ?? false;

  useEffect(() => {
    if (!activeTab?.savedQueryId || activeTab.schemaView) {
      setIsConfigOpen(false);
      setRevealedApiKey(null);
      setHostedConnectionId(null);
    }
  }, [activeTab?.savedQueryId, activeTab?.schemaView]);

  useEffect(() => {
    setHostedConnectionId(null);
  }, [activeTab?.savedQueryId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeTab?.savedQueryId || !activeTab.apiEnabled) {
      setHostedConnectionId(null);
      return;
    }

    queryApiService
      .fetchAPIQueryDetails(activeTab.savedQueryId)
      .then((details) => {
        if (!cancelled) {
          setHostedConnectionId(details.connection_id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHostedConnectionId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab?.apiEnabled, activeTab?.savedQueryId]);

  const handleHostAsApi = useCallback(async () => {
    if (!activeTab?.savedQueryId) {
      toast.error("Save the query first before hosting as API");
      return;
    }

    try {
      const response = await queryApiService.enableAPI(activeTab.savedQueryId);
      dispatch({ type: "SET_API_ENABLED", tabId: activeTab.id, enabled: true });
      void refreshSavedQueries();
      setRevealedApiKey(response.api_key);
      setIsConfigOpen(true);
      toast.success("Query hosted as API", {
        description: `Key: ${response.api_key}  — copy it now, it won't be shown again.`,
        duration: 15000,
      });
      void navigator.clipboard.writeText(response.api_key);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to host as API");
    }
  }, [activeTab, dispatch, refreshSavedQueries]);

  const handleUnhostApi = useCallback(async () => {
    if (!activeTab?.savedQueryId) {
      return;
    }
    if (!confirm("Unhost this API? The API key will stop working immediately.")) {
      return;
    }

    try {
      await queryApiService.disableAPI(activeTab.savedQueryId);
      dispatch({ type: "SET_API_ENABLED", tabId: activeTab.id, enabled: false });
      void refreshSavedQueries();
      setRevealedApiKey(null);
      toast.success("API hosting disabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unhost API");
    }
  }, [activeTab, dispatch, refreshSavedQueries]);

  const handleHostedChange = useCallback(
    (enabled: boolean) => {
      if (!activeTabId) {
        return;
      }
      if (activeTabApiEnabled !== enabled) {
        dispatch({ type: "SET_API_ENABLED", tabId: activeTabId, enabled });
        void refreshSavedQueries();
      }
      if (!enabled) {
        setRevealedApiKey(null);
      }
    },
    [activeTabApiEnabled, activeTabId, dispatch, refreshSavedQueries],
  );

  const renderQueryHeaderSaveMenuItems = useCallback(
    (closeMenu: () => void) => (
      <HostedQuerySaveMenuItems
        savedQueryId={activeTab?.savedQueryId}
        isHosted={activeTab?.apiEnabled ?? false}
        onHostAsApi={
          canManageApi
            ? () => {
                closeMenu();
                void handleHostAsApi();
              }
            : undefined
        }
      />
    ),
    [activeTab?.apiEnabled, activeTab?.savedQueryId, canManageApi, handleHostAsApi],
  );

  const renderQueryHeaderMoreMenuItems = useCallback(
    (closeMenu: () => void) => (
      <HostedQueryMoreMenuItems
        savedQueryId={activeTab?.savedQueryId}
        isHosted={activeTab?.apiEnabled ?? false}
        onUnhostApi={
          canManageApi
            ? () => {
                closeMenu();
                void handleUnhostApi();
              }
            : undefined
        }
      />
    ),
    [activeTab?.apiEnabled, activeTab?.savedQueryId, canManageApi, handleUnhostApi],
  );

  const hostedEndpointChip = useMemo(
    () => (
      <HostedApiEndpointChip
        connectionId={hostedConnectionId}
        queryId={activeTab?.savedQueryId}
        isHosted={activeTab?.apiEnabled ?? false}
      />
    ),
    [activeTab?.apiEnabled, activeTab?.savedQueryId, hostedConnectionId],
  );

  const configPanel = useMemo(() => {
    if (!isConfigOpen || !activeTab?.savedQueryId) {
      return null;
    }

    return (
      <aside className="w-[380px] shrink-0 border-l bg-card">
        <QueryConfigurationPanel
          queryId={activeTab.savedQueryId}
          paramValues={activeTab.variables}
          onParamValueChange={(name, value) => {
            dispatch({
              type: "SET_VARIABLE",
              tabId: activeTab.id,
              name,
              value,
            });
          }}
          initialApiKey={revealedApiKey}
          onClose={() => {
            setIsConfigOpen(false);
            setRevealedApiKey(null);
          }}
          onHostedChange={handleHostedChange}
        />
      </aside>
    );
  }, [
    activeTab,
    dispatch,
    handleHostedChange,
    isConfigOpen,
    refreshSavedQueries,
    revealedApiKey,
  ]);

  return {
    isConfigOpen,
    openConfig: () => setIsConfigOpen(true),
    renderQueryHeaderSaveMenuItems,
    renderQueryHeaderMoreMenuItems,
    hostedEndpointChip,
    configPanel,
  };
}
