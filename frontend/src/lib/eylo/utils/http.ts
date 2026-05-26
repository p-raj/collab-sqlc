/**
 * HTTP utilities shared across all modules
 */

/**
 * Get the server base URL from environment variables
 * @returns Server base URL
 */
export const getServerBaseUrl = (): string => {
  return import.meta.env.VITE_SERVER_BASE_URL || "";
};

/**
 * Create API prefix for widget routes
 * @param organizationId - Organization ID
 * @param resource - Resource name (e.g., 'agents', 'tools', 'integrations')
 * @returns API prefix path
 */
export const getWidgetApiPrefix = (organizationId: string, resource: string): string => {
  return `/api/widget/${organizationId}/${resource}`;
};

/**
 * Create headers for widget API requests with session authentication
 * @param sessionId - Widget session ID
 * @param additionalHeaders - Additional headers to merge
 * @returns Headers object
 */
export const getWidgetHeaders = (
  sessionId: string,
  additionalHeaders?: Record<string, string>
): Record<string, string> => {
  return {
    "Content-Type": "application/json",
    "X-Session-ID": sessionId,
    ...additionalHeaders,
  };
};

/**
 * Handle fetch errors consistently across all HTTP clients
 * @param response - Fetch response
 * @param operation - Operation description for error message
 */
export const handleFetchError = async (response: Response, operation: string): Promise<never> => {
  let errorMessage = `Failed to ${operation}: ${response.statusText}`;

  try {
    const errorData = await response.json();
    if (errorData.detail) {
      errorMessage = `Failed to ${operation}: ${errorData.detail}`;
    }
  } catch {
    // If response body is not JSON, use status text
  }

  throw new Error(errorMessage);
};
