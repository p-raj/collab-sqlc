/**
 * OAuth connection management for conversations
 * Handles tracking pending authentication requests and OAuth popup flows
 */

import { getServerBaseUrl } from "../../utils/http";

interface OAuthInitiateResponse {
  authorization_url: string;
}

type OAuthPostMessage =
  | { type: "EYLO_CONNECTION_SUCCESS"; connectionId: string; integrationName: string }
  | { type: "EYLO_CONNECTION_FAILED"; error?: string };

export interface AuthRequirement {
  integration_id: string;
  integration_name: string;
  reason: string;
  config_id: string | null;
  contact_id: string | null;
  message: string;
  status: "pending" | "connecting" | "connected" | "dismissed" | "failed";
  timestamp: number;
  error?: string;
}

export type AuthRequirementCallback = (requirement: AuthRequirement | null) => void;

export class ConnectionStateManager {
  private organizationId: string;
  private baseUrl: string;
  private getSessionId: () => string | null;
  private pendingAuths: Map<string, AuthRequirement>; // key: integration_id
  private listeners: Set<AuthRequirementCallback>;
  private activePopupIntegrationId: string | null = null;

  constructor(
    organizationId: string,
    baseUrl: string = "/api/v1",
    getSessionId: (() => string | null) | string | null = null
  ) {
    this.organizationId = organizationId;
    this.baseUrl = baseUrl;
    // Support both function and static value for backwards compatibility
    this.getSessionId = typeof getSessionId === "function" ? getSessionId : () => getSessionId;
    this.pendingAuths = new Map();
    this.listeners = new Set();
  }

  /**
   * Add a new auth requirement from AUTH_REQUIRED event
   */
  addAuthRequirement(requirement: Omit<AuthRequirement, "status" | "timestamp">): void {
    const authReq: AuthRequirement = {
      ...requirement,
      status: "pending",
      timestamp: Date.now(),
    };

    this.pendingAuths.set(requirement.integration_id, authReq);
    this.notifyListeners();
  }

  /**
   * Update status of an auth requirement
   */
  updateAuthStatus(integrationId: string, status: AuthRequirement["status"], error?: string): void {
    const auth = this.pendingAuths.get(integrationId);
    if (auth) {
      auth.status = status;
      if (error) {
        auth.error = error;
      } else if (status !== "failed") {
        // Clear error if moving away from failed state
        auth.error = undefined;
      }
      this.notifyListeners();

      // Remove from pending if connected or dismissed
      if (status === "connected" || status === "dismissed") {
        setTimeout(() => {
          this.pendingAuths.delete(integrationId);
          this.notifyListeners();
        }, 500); // Small delay for UI feedback
      }
    }
  }

  /**
   * Get all pending auth requirements (including failed ones that can be retried)
   */
  getPendingAuths(): AuthRequirement[] {
    return Array.from(this.pendingAuths.values()).filter(
      (auth) =>
        auth.status === "pending" || auth.status === "connecting" || auth.status === "failed"
    );
  }

  /**
   * Dismiss an auth requirement
   */
  dismissAuth(integrationId: string): void {
    this.updateAuthStatus(integrationId, "dismissed");
  }

  /**
   * Retry a failed auth requirement
   */
  retryAuth(integrationId: string): void {
    const auth = this.pendingAuths.get(integrationId);
    if (auth && auth.status === "failed") {
      auth.status = "pending";
      auth.error = undefined;
      this.notifyListeners();
    }
  }

  /**
   * Open OAuth popup for an auth requirement
   * Backend generates the complete OAuth URL with proper redirect_uri
   * Uses session-authenticated widget endpoint
   */
  async openOAuthPopup(integrationId: string): Promise<void> {
    // Prevent concurrent OAuth popups
    if (this.activePopupIntegrationId) {
      throw new Error("Another OAuth flow is already in progress");
    }
    this.activePopupIntegrationId = integrationId;

    const auth = this.pendingAuths.get(integrationId);
    if (!auth || !auth.config_id) {
      this.activePopupIntegrationId = null;
      throw new Error("Invalid auth requirement or missing config ID");
    }

    const sessionId = this.getSessionId();
    if (!sessionId) {
      throw new Error("Session ID not available");
    }

    this.updateAuthStatus(integrationId, "connecting");

    try {
      // Fetch the OAuth URL from the widget endpoint with proper X-Session-ID header
      const serverBaseUrl = getServerBaseUrl();
      const apiUrl = `${serverBaseUrl}${this.baseUrl}/widget/${this.organizationId}/connections/oauth/initiate?integration_config_id=${auth.config_id}`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "X-Session-ID": sessionId,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get OAuth URL: ${response.statusText}`);
      }

      const data = (await response.json()) as OAuthInitiateResponse;
      const authUrl = data.authorization_url;

      // Now open the OAuth provider's URL in a popup
      await openOAuthPopup(authUrl);
      this.activePopupIntegrationId = null;
      this.updateAuthStatus(integrationId, "connected");
    } catch (error) {
      this.activePopupIntegrationId = null;
      const errorMsg = error instanceof Error ? error.message : "Connection failed";
      const updatedAuth = this.pendingAuths.get(integrationId);
      if (updatedAuth) {
        updatedAuth.status = "failed";
        updatedAuth.error = errorMsg;
        this.notifyListeners();
      }
      throw error;
    }
  }

  /**
   * Reset all state — call on disconnect to prevent stale data
   */
  reset(): void {
    this.pendingAuths.clear();
    this.activePopupIntegrationId = null;
    this.notifyListeners();
  }

  /**
   * Subscribe to auth requirement changes
   */
  subscribe(callback: AuthRequirementCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback(null));
  }
}

/**
 * Open OAuth popup from direct URL
 * Returns a promise that resolves when connection succeeds or rejects on failure
 */
export function openOAuthPopup(
  url: string
): Promise<{ connectionId: string; integrationName: string }> {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, "oauth_popup", "width=600,height=700,left=200,top=100");

    if (!popup) {
      reject(new Error("Popup blocked. Please allow popups for this site."));
      return;
    }

    // Listen for postMessage from the OAuth callback
    const expectedOrigin = getServerBaseUrl() || window.location.origin;
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;

      const data = event.data as OAuthPostMessage;
      if (data.type === "EYLO_CONNECTION_SUCCESS") {
        window.removeEventListener("message", messageHandler);
        clearInterval(pollTimer);
        resolve({
          connectionId: data.connectionId,
          integrationName: data.integrationName,
        });
      } else if (data.type === "EYLO_CONNECTION_FAILED") {
        window.removeEventListener("message", messageHandler);
        clearInterval(pollTimer);
        reject(new Error(data.error || "Connection failed"));
      }
    };

    window.addEventListener("message", messageHandler);

    // Poll to detect if user closed popup
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener("message", messageHandler);
        reject(new Error("OAuth popup was closed"));
      }
    }, 1000);
  });
}
