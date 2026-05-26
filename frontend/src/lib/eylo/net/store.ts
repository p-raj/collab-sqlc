import { BaseReactiveStore } from "../base/BaseReactiveStore";
import { EventEmitter, EYLO_EVENTS } from "../events";
import type { TContactCreate } from "../modules/contact";
import { ConnectionStateManager } from "../modules/conversation";
import { logger } from "../utils";

import { WebSocketClient } from ".";
import type { EyloStore } from "../store/EyloStore";
import { WS_ACTIONS } from "./constants";
import {
  type TMessageHandler,
  type TWebSocketConfig,
  type TWsEventActionValue,
  type TWsMessage,
} from "./types";

interface SessionInitiateResponse {
  data: { sessionId: string };
}

export type TEyloConnectionState = {
  sessionId: string | null;
  connectionURL: string;
  isConnected?: boolean;
  identified?: boolean;
  error?: unknown;
};

class ConnectionStore extends BaseReactiveStore<TEyloConnectionState> {
  // @ts-ignore
  // the TS compiler does not recognize that _client will be initialized in the constructor
  private _client: WebSocketClient;
  private _parentStore: EyloStore;
  // @ts-ignore
  // ConnectionStateManager is initialized in __init__
  private _connectionStateManager: ConnectionStateManager;

  constructor(parent: EyloStore) {
    const initialState = {
      sessionId: null,
      isConnected: false,
      identified: false,
      error: undefined,
    } as TEyloConnectionState;
    super(initialState, "eylo:connection:");
    this.computed(
      "connectionURL",
      () => {
        // Use the environment variable for the base URL
        const connectionUrl = `${import.meta.env.VITE_SERVER_WS_BASE_URL}/${parent.organizationId}`;

        return connectionUrl;
      },
      []
    );
    this._parentStore = parent;
    this.__init__();
  }

  private __init__ = (): void => {
    this._client = new WebSocketClient({
      url: this.get("connectionURL"),
      eventEmitter: this._parentStore.ee,
    } as TWebSocketConfig);
    this._setupEventListeners();
    this._initConnectionStateManager();
  };

  private _initConnectionStateManager = (): void => {
    // Initialize ConnectionStateManager with dynamic sessionId getter
    this._connectionStateManager = new ConnectionStateManager(
      this._parentStore.organizationId,
      "/api",
      () => this.get("sessionId")
    );

    // Register WebSocket handlers for OAuth connection events
    this.registerMessageHandler("auth:required", (message: TWsMessage) => {
      logger.info("[AUTH_REQUIRED] Received event:", message);
      if (message.data) {
        this._connectionStateManager.addAuthRequirement({
          integration_id: message.data.integration_id,
          integration_name: message.data.integration_name,
          reason: message.data.reason,
          config_id: message.data.config_id,
          contact_id: message.data.contact_id,
          message: message.data.message,
        });
      }
    });

    this.registerMessageHandler("connection:started", (message: TWsMessage) => {
      logger.info("[CONNECTION_STARTED] Received event:", message);
      if (message.data && message.data.integration_config_id) {
        const auth = this._connectionStateManager
          .getPendingAuths()
          .find((a) => a.config_id === message.data.integration_config_id);
        if (auth) {
          this._connectionStateManager.updateAuthStatus(auth.integration_id, "connecting");
        }
      }
    });

    this.registerMessageHandler("connection:success", (message: TWsMessage) => {
      logger.info("[CONNECTION_SUCCESS] Received event:", message);
      if (message.data) {
        const auths = this._connectionStateManager.getPendingAuths();
        const auth = message.data.integration_config_id
          ? auths.find((a) => a.config_id === message.data.integration_config_id)
          : auths.find((a) => a.status === "connecting" || a.status === "pending");
        if (auth) {
          this._connectionStateManager.updateAuthStatus(auth.integration_id, "connected");
        }
      }
    });

    this.registerMessageHandler("connection:failed", (message: TWsMessage) => {
      logger.info("[CONNECTION_FAILED] Received event:", message);
      if (message.data) {
        const auths = this._connectionStateManager.getPendingAuths();
        const auth = message.data.integration_config_id
          ? auths.find((a) => a.config_id === message.data.integration_config_id)
          : auths.find((a) => a.status === "connecting" || a.status === "pending");
        if (auth) {
          this._connectionStateManager.updateAuthStatus(
            auth.integration_id,
            "failed",
            message.data.error || "Connection failed"
          );
        }
      }
    });
  };

  private _setupEventListeners = (): void => {
    const ee: EventEmitter = this._parentStore.ee;
    ee.on(EYLO_EVENTS.NET_CONNECTING, () => {
      this.set("isConnected", false);
      this.set("error", undefined);
      logger.debug("WebSocket is connecting...");
    });
    ee.on(EYLO_EVENTS.NET_CONNECTED, () => {
      this.set("isConnected", true);
      this.set("error", undefined);
      logger.debug("WebSocket is connected.");
    });
    ee.on(EYLO_EVENTS.NET_DISCONNECTED, () => {
      this.set("isConnected", false);
      this.set("identified", false);
      this.set("error", undefined);
      logger.debug("WebSocket is disconnected.");
    });
    ee.on(EYLO_EVENTS.CONTACT_IDENTIFIED, () => {
      this.set("identified", true);
      logger.debug("WS.IDENTIFIED contact associated with session.");
    });
    ee.on(EYLO_EVENTS.ERROR, (e: unknown) => {
      this.set("error", e);
      logger.error("WS.ERROR:", e);
    });
  };

  sendBinary = (data: ArrayBuffer): boolean => {
    if (this._client && this._client.isConnected) {
      return this._client.sendBinary(data);
    } else {
      logger.error("WebSocket is not connected. Cannot send binary data.");
      return false;
    }
  };

  send = (message: TWsMessage): boolean => {
    if (this._client && this._client.isConnected) {
      return this._client.send(message);
    } else {
      logger.error("WebSocket is not connected. Cannot send message.");
      return false;
    }
  };

  private _isValidEventAction(action: string | TWsEventActionValue): action is TWsEventActionValue {
    const validActions: TWsEventActionValue[] = Object.keys(WS_ACTIONS).map(
      (key) => WS_ACTIONS[key as keyof typeof WS_ACTIONS]
    );
    return validActions.includes(action as TWsEventActionValue);
  }

  // TODO: since this is a store, we can just synchronize the connection process
  // and session
  // on session null we can just disconnect
  // on session not null we can just connect
  // this way we can avoid multiple connections and disconnections
  public connect = async (contactDetails: TContactCreate): Promise<void> => {
    if (this.get("isConnected")) {
      logger.warn("Already connected.");
      return;
    }
    this.disconnect(); // Ensure we start with a clean state
    try {
      const sessionId = await this.initiateSession(contactDetails);
      this.set("sessionId", sessionId);
      this._client.initialize(sessionId);
    } catch (error) {
      logger.error("Failed to connect:", error);
      const ee: EventEmitter = this._parentStore.ee;
      ee.emit(EYLO_EVENTS.ERROR, error);
    }
  };

  public disconnect = (code: number = 1000, reason: string = "Normal closure"): void => {
    this._client.terminate(code, reason);
    this._connectionStateManager.reset();
    this.set("isConnected", false);
    this.set("identified", false);
    this.set("error", undefined);
    this.set("sessionId", null);
  };

  /**
   * Get the ConnectionStateManager instance for managing OAuth connections
   */
  get connectionStateManager(): ConnectionStateManager {
    return this._connectionStateManager;
  }

  public registerMessageHandler = (action: TWsEventActionValue, handler: TMessageHandler): void => {
    if (!this._isValidEventAction(action)) {
      logger.warn(`Invalid action type: ${action}. Skipping.`);
      return;
    }
    if (typeof handler !== "function") {
      logger.warn(`Handler for action ${action} is not a function. Skipping.`);
      return;
    }
    if (this._client.messageHandlers[action]) {
      this._client.messageHandlers[action]!.push(handler);
    } else {
      this._client.messageHandlers[action] = [handler];
    }
  };

  public deregisterMessageHandler = (
    action: TWsEventActionValue,
    handler: TMessageHandler
  ): void => {
    if (!this._isValidEventAction(action)) {
      logger.warn(`Invalid action type: ${action}. Skipping.`);
      return;
    }
    if (typeof handler !== "function") {
      logger.warn(`Handler for action ${action} is not a function. Skipping.`);
      return;
    }
    const handlers = this._client.messageHandlers[action];
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
        logger.debug(`Handler for action ${action} deregistered.`);
      } else {
        logger.warn(`Handler for action ${action} not found.`);
      }
    } else {
      logger.warn(`No handlers registered for action ${action}.`);
    }
  };

  public initiateSession = async (contactDetails: TContactCreate): Promise<string> => {
    const response = await fetch(
      `${import.meta.env.VITE_SERVER_BASE_URL}/api/auth/widget/session/initiate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: this._parentStore.organizationId,
          ...contactDetails,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to initiate session");
    }

    const data = (await response.json()) as SessionInitiateResponse;
    return data.data.sessionId;
  };
}

export { ConnectionStore };
