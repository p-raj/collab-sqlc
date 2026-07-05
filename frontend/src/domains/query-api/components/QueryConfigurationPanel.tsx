import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Settings, X } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { ErrorState, LoadingState } from "@/shared/components/ui/DataState";
import { IconButton } from "@/shared/components/ui/IconButton";
import type { EnableAPIResponse } from "../types";
import type { APIQueryDetails } from "../types";
import * as queryApiService from "../services/query-api";
import { APIConfigPanel } from "./APIConfigPanel";
import { APITestPanel } from "./APITestPanel";

interface Props {
  queryId: string;
  paramValues: Record<string, string>;
  onParamValueChange: (name: string, value: string) => void;
  onClose?: () => void;
  onHostedChange?: (enabled: boolean) => void;
  initialApiKey?: string | null;
}

type PanelTab = "config" | "test";

export function QueryConfigurationPanel({
  queryId,
  paramValues,
  onParamValueChange,
  onClose,
  onHostedChange,
  initialApiKey = null,
}: Props) {
  const [details, setDetails] = useState<APIQueryDetails | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("config");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(initialApiKey);
  const requestIdRef = useRef(0);
  const resolvedConnectionId = details?.connection_id ?? null;

  const loadDetails = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const response = await queryApiService.fetchAPIQueryDetails(queryId);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setDetails(response);
    } catch (err) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load query configuration");
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [queryId]);

  useEffect(() => {
    setDetails(null);
    setActiveTab("config");
    setRevealedApiKey(initialApiKey);
    void loadDetails();
  }, [initialApiKey, loadDetails, queryId]);

  useEffect(() => {
    if (details?.id === queryId) {
      onHostedChange?.(details.api_enabled);
    }
  }, [details, onHostedChange, queryId]);

  const handleEnabled = useCallback(
    (response: EnableAPIResponse) => {
      setRevealedApiKey(response.api_key);
      onHostedChange?.(true);
      void loadDetails();
    },
    [loadDetails, onHostedChange],
  );

  const handleDisabled = useCallback(() => {
    setRevealedApiKey(null);
    onHostedChange?.(false);
    setActiveTab("config");
    void loadDetails();
  }, [loadDetails, onHostedChange]);

  const handleConfigUpdated = useCallback(() => {
    void loadDetails();
  }, [loadDetails]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {details?.title ?? "Query configuration"}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {details?.api_enabled ? "Hosted API settings and testing" : "Parameters and hosting"}
          </p>
        </div>
        {onClose && (
          <IconButton
            aria-label="Close query configuration"
            onClick={onClose}
            size="xs"
            icon={<X size={14} />}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setActiveTab("config")}
          leftIcon={<Settings size={12} />}
          className={activeTab === "config" ? "bg-accent text-foreground" : ""}
        >
          Configuration
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={!details?.api_enabled}
          onClick={() => setActiveTab("test")}
          leftIcon={<Play size={12} />}
          className={activeTab === "test" ? "bg-accent text-foreground" : ""}
        >
          Test
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <LoadingState label="Loading configuration" showLabel className="h-full px-4" />
        )}

        {!loading && error && (
          <div className="p-4">
            <ErrorState title="Unable to load query configuration" message={error} className="p-0">
              <Button onClick={() => void loadDetails()} size="xs" className="mt-2">
                Retry
              </Button>
            </ErrorState>
          </div>
        )}

        {!loading && !error && details && activeTab === "config" && (
          <APIConfigPanel
            queryId={details.id}
            connectionId={resolvedConnectionId}
            isHosted={details.api_enabled}
            apiKeyPrefix={details.api_key_prefix}
            revealedApiKey={revealedApiKey}
            parameters={details.api_parameters}
            rowLimit={details.api_row_limit}
            rateLimit={details.api_rate_limit}
            timeoutSeconds={details.api_timeout_seconds}
            allowedIps={details.api_allowed_ips}
            notes={details.api_notes}
            hasSqlDrift={details.has_sql_drift}
            onEnabled={handleEnabled}
            onDisabled={handleDisabled}
            onConfigUpdated={handleConfigUpdated}
          />
        )}

        {!loading && !error && details && activeTab === "test" && (
          <APITestPanel
            queryId={details.id}
            parameters={details.api_parameters}
            connectionId={resolvedConnectionId}
            paramValues={paramValues}
            onParamValueChange={onParamValueChange}
          />
        )}
      </div>
    </div>
  );
}
