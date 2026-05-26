/**
 * HTTP utilities for agent-related API calls
 */

import {
  getServerBaseUrl,
  getWidgetApiPrefix,
  getWidgetHeaders,
  handleFetchError,
} from "../../utils";
import type { TAgentToolsByIntegration } from "./types";

/**
 * Fetch agent tools grouped by integration with connection status
 *
 * @param organizationId - Organization ID
 * @param agentId - Agent ID
 * @param sessionId - Widget session ID for authentication
 * @returns Promise resolving to agent tools grouped by integration
 */
export async function fetchAgentToolsWithIntegrations(
  organizationId: string,
  agentId: string,
  sessionId: string
): Promise<TAgentToolsByIntegration[]> {
  const url = `${getServerBaseUrl()}${getWidgetApiPrefix(organizationId, "agents")}/${agentId}/tools-with-integrations`;

  const response = await fetch(url, {
    method: "GET",
    headers: getWidgetHeaders(sessionId),
  });

  if (!response.ok) {
    await handleFetchError(response, "fetch agent tools");
  }

  const data = await response.json();
  return data;
}

/**
 * Batch response for bulk agent tools with integrations
 */
export type TBulkAgentToolsByIntegration = {
  agentId: string;
  integrations: TAgentToolsByIntegration[];
};

/**
 * Fetch tools grouped by integration for multiple agents in one request.
 * Avoids N+1 API calls when rendering the agent list.
 */
export async function fetchBulkAgentToolsWithIntegrations(
  organizationId: string,
  agentIds: string[],
  sessionId: string
): Promise<TBulkAgentToolsByIntegration[]> {
  const url = `${getServerBaseUrl()}${getWidgetApiPrefix(organizationId, "agents")}/bulk-tools-with-integrations`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...getWidgetHeaders(sessionId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agentIds }),
  });

  if (!response.ok) {
    await handleFetchError(response, "fetch bulk agent tools");
  }

  const data = await response.json();
  return data;
}
