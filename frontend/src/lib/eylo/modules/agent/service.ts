import { WS_ACTIONS } from "../../net";
import type { EyloStore } from "../../store";
import { logger } from "../../utils";

import {
  fetchAgentToolsWithIntegrations,
  fetchBulkAgentToolsWithIntegrations,
  type TBulkAgentToolsByIntegration,
} from "./http";
import { Agent } from "./model";
import type { AgentStore } from "./store";
import type { TAgent, TAgentToolsByIntegration } from "./types";

export type AgentStatus = {
  type: "thinking" | "processing" | "tool_executing" | "tool_completed" | "complete" | null;
  message: string;
  conversationId?: string;
};

type AgentStatusCallback = (status: AgentStatus) => void;

// refactor this to just depend on AgentStore
class AgentService {
  private static _instance: AgentService | undefined = undefined;
  // @ts-ignore
  private _eyloStore: EyloStore;
  // @ts-ignore
  private _agentStore: AgentStore;
  private _statusCallbacks: AgentStatusCallback[] = [];

  constructor(eyloStore: EyloStore) {
    if (AgentService._instance) {
      return AgentService._instance;
    }
    this._eyloStore = eyloStore;
    this._agentStore = this._eyloStore.agentStore;
    this._installHandlers();
    AgentService._instance = this;
  }

  // Subscribe to agent status updates
  public onStatusChange(callback: AgentStatusCallback): () => void {
    this._statusCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this._statusCallbacks.indexOf(callback);
      if (index > -1) {
        this._statusCallbacks.splice(index, 1);
      }
    };
  }

  private _notifyStatusChange(status: AgentStatus): void {
    this._statusCallbacks.forEach((callback) => callback(status));
  }

  private toJson = (agent: Agent): TAgent => {
    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      externalId: agent.externalId,
    };
  };

  private _systemMessageHandler = () => {
    const _handler = (message: any) => {
      if (message.data && message.data.agents) {
        message.data.agents.forEach((agent: any) => {
          this._agentStore.add_(new Agent(agent));
        });
      } else {
        logger.warn("Received system message without data.");
      }
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.SYSTEM, _handler);
  };

  private _agentThinkingHandler = () => {
    const _handler = (message: any) => {
      logger.debug("Agent thinking event received", message);
      this._notifyStatusChange({
        type: "thinking",
        message: message.data?.message || "Agent is thinking...",
        conversationId: message.data?.conversation_id,
      });
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.AGENT_THINKING, _handler);
  };

  private _agentProcessingHandler = () => {
    const _handler = (message: any) => {
      logger.debug("Agent processing event received", message);
      this._notifyStatusChange({
        type: "processing",
        message: message.data?.message || "Processing your request...",
        conversationId: message.data?.conversation_id,
      });
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.AGENT_PROCESSING, _handler);
  };

  private _toolExecutingHandler = () => {
    const _handler = (message: any) => {
      logger.debug("Tool executing event received", message);
      this._notifyStatusChange({
        type: "tool_executing",
        message: message.data?.message || "Using tools...",
        conversationId: message.data?.conversation_id,
      });
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.TOOL_EXECUTING, _handler);
  };

  private _toolCompletedHandler = () => {
    const _handler = (message: any) => {
      logger.debug("Tool completed event received", message);
      this._notifyStatusChange({
        type: "tool_completed",
        message: message.data?.message || "Processing results...",
        conversationId: message.data?.conversation_id,
      });
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.TOOL_COMPLETED, _handler);
  };

  private _agentResponseCompleteHandler = () => {
    const _handler = (message: any) => {
      logger.debug("Agent response complete event received", message);
      this._notifyStatusChange({
        type: "complete",
        message: "",
        conversationId: message.data?.conversation_id,
      });
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.AGENT_RESPONSE_COMPLETE, _handler);
  };

  public resolveAgent_byID(agentId: string): TAgent | undefined {
    const agent = this._agentStore.get_(agentId);
    if (!agent) {
      logger.warn(`Agent with ID ${agentId} not found.`);
      return undefined;
    }
    return this.toJson(agent);
  }

  public listAgents(): TAgent[] {
    const agents = this._agentStore.list_();
    if (!agents || agents.length === 0) {
      logger.warn("No agents found.");
      return [];
    }
    return agents.map((agent) => this.toJson(agent));
  }

  /**
   * Fetch agent tools grouped by integration with connection status.
   * Requires active session (widget must be initialized)
   *
   * @param agentId - Agent ID to fetch tools for
   * @returns Promise resolving to tools grouped by integration
   */
  public async fetchAgentIntegrations(agentId: string): Promise<TAgentToolsByIntegration[]> {
    const organizationId = this._eyloStore.organizationId;
    const sessionId = this._eyloStore.sessionId;

    if (!organizationId) {
      logger.error("Organization ID not found in store");
      throw new Error("Organization ID required to fetch agent integrations");
    }

    if (!sessionId) {
      logger.error("Session ID not found - widget not initialized");
      throw new Error(
        "Widget session required to fetch agent integrations. Call initialize() first."
      );
    }

    try {
      const integrations = await fetchAgentToolsWithIntegrations(
        organizationId,
        agentId,
        sessionId
      );
      logger.debug(`Fetched ${integrations.length} integration groups for agent ${agentId}`);
      return integrations;
    } catch (error) {
      logger.error(`Failed to fetch agent integrations: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch tools grouped by integration for multiple agents in one request.
   * Avoids N+1 API calls when rendering the agent list.
   *
   * @param agentIds - List of agent IDs to fetch tools for
   * @returns Promise resolving to per-agent tool groups
   */
  public async fetchBulkAgentIntegrations(
    agentIds: string[]
  ): Promise<TBulkAgentToolsByIntegration[]> {
    const organizationId = this._eyloStore.organizationId;
    const sessionId = this._eyloStore.sessionId;

    if (!organizationId) {
      logger.error("Organization ID not found in store");
      throw new Error("Organization ID required to fetch agent integrations");
    }

    if (!sessionId) {
      logger.error("Session ID not found - widget not initialized");
      throw new Error(
        "Widget session required to fetch agent integrations. Call initialize() first."
      );
    }

    try {
      const results = await fetchBulkAgentToolsWithIntegrations(
        organizationId,
        agentIds,
        sessionId
      );
      logger.debug(
        `Fetched integrations for ${results.length} agents in one request`
      );
      return results;
    } catch (error) {
      logger.error(`Failed to fetch bulk agent integrations: ${error}`);
      throw error;
    }
  }

  private _installHandlers = (): void => {
    this._systemMessageHandler();
    this._agentThinkingHandler();
    this._agentProcessingHandler();
    this._toolExecutingHandler();
    this._toolCompletedHandler();
    this._agentResponseCompleteHandler();
  };
}

export { AgentService };
