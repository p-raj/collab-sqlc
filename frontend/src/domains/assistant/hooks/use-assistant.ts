import { useCallback, useEffect, useRef, useState } from "react";
import { EYLO_EVENTS } from "@/lib/eylo";
import type { TConversation } from "@/lib/eylo/modules/conversation/types";
import type { TMessage, TMessageWParticipant } from "@/lib/eylo/modules/message/types";
import { useEylo } from "@/shared/contexts/eylo-provider";

// ── Agent status ───────────────────────────────────────────

interface AgentStatus {
  type: "thinking" | "processing" | "tool_executing" | "tool_completed" | "complete" | null;
  message: string;
}

export function useAgentStatus(): AgentStatus {
  const { eylo } = useEylo();
  const [status, setStatus] = useState<AgentStatus>({ type: null, message: "" });

  useEffect(() => {
    if (!eylo) return;
    return eylo.agentService.onStatusChange((s) => setStatus(s));
  }, [eylo]);

  return status;
}

// ── Conversations ──────────────────────────────────────────

export function useConversations() {
  const { eylo, agentId, initialized } = useEylo();
  const [conversations, setConversations] = useState<TConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!eylo) return;
    const store = eylo.store.conversationStore;
    if (!store) return;
    const all = store.list_() as TConversation[];
    const sorted = [...all].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setConversations(sorted);
  }, [eylo]);

  useEffect(() => {
    if (!eylo || !initialized) return;

    // Load existing conversations
    eylo.conversationService.listConversations();

    const handleCreated = () => refresh();
    const handleUpdated = () => refresh();
    // SESSION_INITIALIZED fires after the system message with agents/conversations arrives
    const handleSession = () => {
      setTimeout(refresh, 200);
    };

    eylo.ee.on(EYLO_EVENTS.CONVERSATION_CREATED, handleCreated);
    eylo.ee.on(EYLO_EVENTS.CONVERSATION_UPDATED, handleUpdated);
    eylo.ee.on(EYLO_EVENTS.SESSION_INITIALIZED, handleSession);

    // Initial load after mount
    setTimeout(refresh, 300);

    return () => {
      eylo.ee.off(EYLO_EVENTS.CONVERSATION_CREATED, handleCreated);
      eylo.ee.off(EYLO_EVENTS.CONVERSATION_UPDATED, handleUpdated);
      eylo.ee.off(EYLO_EVENTS.SESSION_INITIALIZED, handleSession);
    };
  }, [eylo, initialized, refresh]);

  const startConversation = useCallback(
    (text: string, context?: Record<string, unknown>) => {
      if (!eylo || !agentId) return;

      const requestId = `conv-${Date.now()}`;
      eylo.startConversation(
        {
          from: { kind: "CONTACT", externalId: eylo.contact?.externalId },
          to: { kind: "AGENT", id: agentId },
          message: { content: [{ kind: "TEXT", value: text }] },
          context,
          channel: "WIDGET",
        },
        requestId
      );

      // The SDK fires CONVERSATION_CREATED which triggers refresh
      // Auto-select the new conversation once it appears
      const handleCreated = (conversation: TConversation) => {
        setActiveConversationId(conversation.id);
        eylo.ee.off(EYLO_EVENTS.CONVERSATION_CREATED, handleCreated);
      };
      eylo.ee.on(EYLO_EVENTS.CONVERSATION_CREATED, handleCreated);
    },
    [eylo, agentId]
  );

  return {
    conversations,
    activeConversationId,
    setActiveConversationId,
    startConversation,
    refresh,
  };
}

// ── Messages ───────────────────────────────────────────────

export function useMessages(conversationId: string | null) {
  const { eylo } = useEylo();
  const [messages, setMessages] = useState<TMessageWParticipant[]>([]);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const refresh = useCallback(() => {
    if (!eylo || !conversationIdRef.current) {
      setMessages([]);
      return;
    }
    const msgs = eylo.messageService.resolve_byConversationId(conversationIdRef.current);
    setMessages(msgs);
  }, [eylo]);

  useEffect(() => {
    if (!eylo || !conversationId) {
      setMessages([]);
      return;
    }

    // Load messages for this conversation
    eylo.conversationService.resolveConversation(conversationId, 50);
    setTimeout(refresh, 200);

    const handleMessage = (msg: TMessage) => {
      if (msg.conversationId === conversationIdRef.current) {
        refresh();
      }
    };

    eylo.ee.on(EYLO_EVENTS.MESSAGE_CREATED, handleMessage);
    return () => {
      eylo.ee.off(EYLO_EVENTS.MESSAGE_CREATED, handleMessage);
    };
  }, [eylo, conversationId, refresh]);

  const sendMessage = useCallback(
    (text: string, context?: Record<string, unknown>) => {
      if (!eylo || !conversationId) return;
      const requestId = `msg-${Date.now()}`;
      eylo.sendMessage({ conversationId, text, context }, requestId);
    },
    [eylo, conversationId]
  );

  const getContent = useCallback(
    (message: TMessage): string => {
      if (!eylo) return "";
      return eylo.messageService.getMessageContent(message);
    },
    [eylo]
  );

  return { messages, sendMessage, getContent, refresh };
}
