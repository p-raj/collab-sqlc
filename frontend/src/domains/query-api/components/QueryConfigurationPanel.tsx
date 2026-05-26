import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Loader2, Play, Settings, X } from "lucide-react";
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

function TabButton({
  active,
  children,
  disabled = false,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

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
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close query configuration"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2">
        <TabButton active={activeTab === "config"} onClick={() => setActiveTab("config")}>
          <Settings size={12} />
          Configuration
        </TabButton>
        <TabButton
          active={activeTab === "test"}
          disabled={!details?.api_enabled}
          onClick={() => setActiveTab("test")}
        >
          <Play size={12} />
          Test
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading configuration...
          </div>
        )}

        {!loading && error && (
          <div className="p-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Unable to load query configuration</p>
                  <p className="mt-1 text-xs opacity-90">{error}</p>
                  <button
                    type="button"
                    onClick={() => void loadDetails()}
                    className="mt-2 text-xs font-medium underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
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
