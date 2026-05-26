import { EYLO_EVENTS } from "../../events";
import type { TWsMessage } from "../../net";
import { WS_ACTIONS } from "../../net/constants";
import type { EyloStore } from "../../store";
import { logger } from "../../utils";
import { isNull } from "es-toolkit";

import { MessageService } from "../message/service";
import type { TMessageWParticipant } from "../message/types";
import { Conversation } from "./model";
import type { ConversationStore } from "./store";
import type { TConversationAggregate, TConversationChannel, TConversationContext, TConversationCreate, TConversationStatus } from "./types";
import { AggregateConverter } from "./utils/aggregate-converter";

// refactor this to just depend on ConversationStore
class ConversationService {
  private static _instance: ConversationService | undefined = undefined;
  // @ts-ignore
  private _eyloStore: EyloStore;
  // @ts-ignore
  private _conversationStore: ConversationStore;

  constructor(eyloStore: EyloStore) {
    if (ConversationService._instance) {
      return ConversationService._instance;
    }
    this._eyloStore = eyloStore;
    this._conversationStore = this._eyloStore.conversationStore;
    this._installHandlers();
    ConversationService._instance = this;
  }

  private _conversationStartedHandler = () => {
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.CONVERSATION_CREATED, (message) => {
      if (message.data) {
        const conversation = new Conversation(message.data);
        this._conversationStore.add_(conversation);
        this._eyloStore.ee.emit(EYLO_EVENTS.CONVERSATION_CREATED, conversation);
      } else {
        logger.warn("Received conversation created message without data.");
      }
    });
  };

  private _conversationUpdatedHandler = () => {
    const _handler = (message: TWsMessage) => {
      if (message.data) {
        const conversation = new Conversation(message.data);
        this._conversationStore.update_(conversation);
        this._eyloStore.ee.emit(EYLO_EVENTS.CONVERSATION_UPDATED, conversation);
      } else {
        logger.warn("Received conversation updated message without data.");
      }
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.CONVERSATION_UPDATED, _handler);
  };

  private _conversationQueryHandler = () => {
    /**
     * Handles conversation query responses with aggregate data.
     *
     * The backend returns conversations with all related entities in a single response:
     * - Contact (who started the conversation)
     * - Primary agent + all agents involved
     * - Participants (mapping between conversations and agents/contacts)
     * - Messages (limited to N most recent, default 1 for list views)
     *
     * This handler distributes the aggregate data to appropriate stores using their services.
     */
    const _handler = (message: TWsMessage) => {
      if (message.data) {
        message.data.forEach((aggregateData: TConversationAggregate) => {
          // 1. Store the conversation
          const conversation = new Conversation({
            id: aggregateData.id,
            organizationId: aggregateData.organizationId,
            externalId: "", // Not included in aggregate
            channel: aggregateData.channel as TConversationChannel,
            status: aggregateData.status as TConversationStatus,
            title: aggregateData.title || "",
            endedAt: aggregateData.endedAt
              ? typeof aggregateData.endedAt === "string"
                ? new Date(aggregateData.endedAt)
                : aggregateData.endedAt
              : null,
            meta: aggregateData.meta,
            messageCount: aggregateData.messageCount,
            createdAt:
              typeof aggregateData.createdAt === "string"
                ? new Date(aggregateData.createdAt)
                : aggregateData.createdAt,
            updatedAt:
              typeof aggregateData.updatedAt === "string"
                ? new Date(aggregateData.updatedAt)
                : aggregateData.updatedAt,
          });
          this._conversationStore.add_(conversation);
          this._eyloStore.ee.emit(EYLO_EVENTS.CONVERSATION_CREATED, conversation);

          // 2. Store contact if present
          if (aggregateData.contact) {
            const contact = AggregateConverter.contactSummaryToContact(aggregateData.contact);
            this._eyloStore.contactStore.add_(contact);
          }

          // 3. Store all agents (primary + all)
          const agentsToStore = new Set<string>(); // Deduplicate by ID

          if (aggregateData.primaryAgent) {
            agentsToStore.add(aggregateData.primaryAgent.id);
            const agent = AggregateConverter.agentSummaryToAgent(aggregateData.primaryAgent);
            this._eyloStore.agentStore.add_(agent);
          }

          if (aggregateData.allAgents) {
            aggregateData.allAgents.forEach((agentSummary) => {
              if (!agentsToStore.has(agentSummary.id)) {
                agentsToStore.add(agentSummary.id);
                const agent = AggregateConverter.agentSummaryToAgent(agentSummary);
                this._eyloStore.agentStore.add_(agent);
              }
            });
          }

          // 4. Store participants
          if (aggregateData.participants) {
            aggregateData.participants.forEach((participantSummary) => {
              const participant = AggregateConverter.participantSummaryToParticipant(
                participantSummary,
                aggregateData.id
              );
              this._eyloStore.participantStore.add_(participant);
              this._eyloStore.ee.emit(EYLO_EVENTS.PARTICIPANT_CREATED, participant);
            });
          }

          // 5. Store messages
          if (aggregateData.messages) {
            aggregateData.messages.forEach((messageSummary) => {
              const msg = AggregateConverter.messageSummaryToMessage(
                messageSummary,
                aggregateData.id
              );
              this._conversationStore.messageStore.add_(msg);
              this._eyloStore.ee.emit(EYLO_EVENTS.MESSAGE_CREATED, msg);
            });
          }
        });
      } else {
        logger.warn("Received conversation query message without data.");
      }
    };
    this._eyloStore.cm.registerMessageHandler(WS_ACTIONS.CONVERSATION_QUERY, _handler);
  };

  private _installHandlers = (): void => {
    this._conversationStartedHandler();
    this._conversationUpdatedHandler();
    this._conversationQueryHandler();
  };

  public startConversation = (data: TConversationCreate, requestId: string): void => {
    const conversation = {
      externalId: data.externalId,
      from: data.from,
      to: data.to,
      message: data.message,
      context: data.context,
      channel: "WIDGET",
    };

    this._eyloStore.cm.send({
      kind: WS_ACTIONS.CONVERSATION_CREATED,
      data: conversation,
      requestId,
    } as TWsMessage);
  };

  public listConversations = (filters: { page?: number; limit?: number } = {}): void => {
    const { page = 1, limit = 100 } = filters;
    const messageLimit = 10;
    const messageOffset = 0;
    this._eyloStore.cm.send({
      kind: WS_ACTIONS.CONVERSATION_QUERY,
      data: {
        filters: {
          page: page,
          limit: limit,
          messageLimit, // Load 10 messages for list view
          messageOffset,
        },
      },
      requestId: `conversation-query-${page}-${limit}-${messageLimit}-${messageOffset}`,
    } as TWsMessage);
  };

  public resolveConversation = (
    conversationId: string,
    messageLimit: number = 10
  ): TConversationContext | undefined => {
    if (isNull(conversationId)) {
      logger.warn("Conversation ID is null or undefined.");
      return;
    }
    const conversation = this._conversationStore.get_(conversationId);

    if (!conversation) {
      // Query with aggregate to get all related data in one call
      // For detail view, load 50 messages starting from offset 0
      const messageOffset = 0;
      this._eyloStore.cm.send({
        kind: WS_ACTIONS.CONVERSATION_QUERY,
        data: {
          filters: {
            conversationIds: [conversationId],
            messageLimit: messageLimit,
            messageOffset,
          },
        },
        requestId: `${conversationId}-aggregate-query-${messageLimit}-${messageOffset}`,
      } as TWsMessage);

      logger.warn(`Conversation with ID ${conversationId} not found.`);
      return;
    }

    const _ms = new MessageService(this._eyloStore);
    const messages = _ms.resolve_byConversationId(conversationId);
    return {
      conversation: conversation,
      messages: messages,
    };
  };

  public getLastMessage = (conversationId: string): TMessageWParticipant | undefined => {
    const _ms = new MessageService(this._eyloStore);
    const messages = _ms.resolve_byConversationId(conversationId);
    if (messages.length === 0) {
      return;
    }
    // Sort by createdAt descending to ensure we get the most recent message
    const sortedMessages = messages.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sortedMessages[0];
  };

  /**
   * Load more messages for a conversation with pagination.
   *
   * @param conversationId - The conversation ID
   * @param messageLimit - Number of messages to fetch
   * @param messageOffset - Offset for pagination
   */
  public loadMoreMessages = (
    conversationId: string,
    messageLimit: number = 20,
    messageOffset: number = 0
  ): void => {
    if (isNull(conversationId)) {
      logger.warn("Conversation ID is null or undefined.");
      return;
    }

    logger.debug(
      `Loading more messages for conversation ${conversationId}, limit: ${messageLimit}, offset: ${messageOffset}`
    );

    // Query for more messages using CONVERSATION_QUERY with pagination
    this._eyloStore.cm.send({
      kind: WS_ACTIONS.CONVERSATION_QUERY,
      data: {
        filters: {
          conversationIds: [conversationId],
          messageLimit,
          messageOffset,
        },
      },
      requestId: `${conversationId}-load-more-${messageLimit}-${messageOffset}`,
    } as TWsMessage);
  };
}

export { ConversationService };
