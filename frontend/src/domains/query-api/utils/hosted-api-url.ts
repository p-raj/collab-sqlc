export function buildHostedApiPath(connectionId: string, queryId: string): string {
  return `/api/v1/q/${connectionId}/execute/${queryId}`;
}

export function buildHostedApiUrl(connectionId: string, queryId: string): string {
  const apiBase = new URL(
    import.meta.env.VITE_API_URL || window.location.origin,
    window.location.origin,
  );
  const basePath =
    apiBase.pathname && apiBase.pathname !== "/" ? apiBase.pathname.replace(/\/$/, "") : "";

  return `${apiBase.origin}${basePath}${buildHostedApiPath(connectionId, queryId)}`;
}
