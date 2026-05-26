import { useCallback, useMemo } from "react";
import { Copy, Globe } from "lucide-react";
import { toast } from "sonner";
import { buildHostedApiPath, buildHostedApiUrl } from "../utils/hosted-api-url";

interface HostedApiEndpointChipProps {
  connectionId: string | null;
  queryId: string | null | undefined;
  isHosted: boolean;
}

export function HostedApiEndpointChip({
  connectionId,
  queryId,
  isHosted,
}: HostedApiEndpointChipProps) {
  const hostedApiPath = useMemo(() => {
    if (!isHosted || !connectionId || !queryId) {
      return null;
    }

    return buildHostedApiPath(connectionId, queryId);
  }, [connectionId, isHosted, queryId]);

  const hostedApiUrl = useMemo(() => {
    if (!isHosted || !connectionId || !queryId) {
      return null;
    }

    return buildHostedApiUrl(connectionId, queryId);
  }, [connectionId, isHosted, queryId]);

  const handleCopyHostedApiUrl = useCallback(async () => {
    if (!hostedApiUrl) {
      return;
    }

    await navigator.clipboard.writeText(hostedApiUrl);
    toast.success("Full API URL copied");
  }, [hostedApiUrl]);

  if (!hostedApiUrl || !hostedApiPath) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopyHostedApiUrl()}
      title={`Copy full API URL: ${hostedApiUrl}`}
      className="ml-auto inline-flex max-w-[440px] items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
    >
      <Globe size={12} />
      <span className="truncate font-mono">{hostedApiPath}</span>
      <Copy size={12} className="shrink-0" />
    </button>
  );
}
