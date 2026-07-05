import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageSquarePlus, Send, ArrowLeft, Code } from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/shared/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "@/shared/components/ui/DataState";
import { IconButton } from "@/shared/components/ui/IconButton";
import { ObjectListItem } from "@/shared/components/ui/ObjectListItem";
import { Textarea } from "@/shared/components/ui/Textarea";
import { useEylo } from "@/shared/contexts/eylo-provider";
import { useConversations, useMessages, useAgentStatus } from "../hooks/use-assistant";
import type { TConversation } from "@/lib/eylo/modules/conversation/types";
import type { TMessageWParticipant } from "@/lib/eylo/modules/message/types";

// ── Props ──────────────────────────────────────────────────

interface AssistantPanelProps {
  connectionDbml: Record<string, unknown> | null;
  onApplySql: (sql: string) => void;
}

// ── Conversation List ──────────────────────────────────────

function ConversationList({
  conversations,
  onSelect,
  onNew,
}: {
  conversations: TConversation[];
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Button
        onClick={onNew}
        leftIcon={<MessageSquarePlus size={12} />}
        className="mx-2 mb-1 justify-start"
      >
        New Conversation
      </Button>
      {conversations.length === 0 && (
        <EmptyState title="No conversations yet" className="px-2 py-3" />
      )}
      {conversations.map((conv) => (
        <ObjectListItem
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className="flex-col items-start gap-0.5 border-b border-border px-2 py-1.5"
        >
          <span className="truncate text-xs font-medium">
            {conv.title || "Untitled"}
          </span>
          <span className="text-[0.75rem] text-muted-foreground">
            {new Date(conv.createdAt).toLocaleDateString()}
          </span>
        </ObjectListItem>
      ))}
    </div>
  );
}

// ── Status Indicator ───────────────────────────────────────

function AgentStatusIndicator() {
  const status = useAgentStatus();
  if (!status.type || status.type === "complete") return null;

  const labels: Record<string, string> = {
    thinking: "Thinking…",
    processing: "Processing…",
    tool_executing: "Running tool…",
    tool_completed: "Tool done",
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <Loader2 size={10} className="animate-spin text-muted-foreground" />
      <span className="text-[0.75rem] text-muted-foreground">
        {status.message || labels[status.type] || "Working…"}
      </span>
    </div>
  );
}

// ── Code Block Extraction (from HTML) ──────────────────────

function extractSqlBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      const decoded = m[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      blocks.push(decoded);
    }
  }
  return blocks;
}

// ── Message Bubble ─────────────────────────────────────────

function MessageBubble({
  message,
  content,
  onApplySql,
}: {
  message: TMessageWParticipant;
  content: string;
  onApplySql: (sql: string) => void;
}) {
  const isUser = message.kind === "USER";
  const sqlBlocks = isUser ? [] : extractSqlBlocks(content);
  const sanitizedContent = useMemo(() => DOMPurify.sanitize(content), [content]);

  return (
    <div className={`flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[90%] rounded-lg px-2 py-1.5 text-xs leading-relaxed ${isUser
            ? "bg-foreground/10 text-foreground"
            : "bg-accent/50 text-foreground"
          }`}
      >
        <div
          className="assistant-message-content"
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />
      </div>
      {sqlBlocks.length > 0 && (
        <div className="flex gap-1 px-1">
          {sqlBlocks.map((block, i) => (
            <Button
              key={i}
              onClick={() => onApplySql(block)}
              variant="ghost"
              size="xs"
              leftIcon={<Code size={9} />}
              title="Apply to editor"
            >
              Apply SQL{sqlBlocks.length > 1 ? ` #${i + 1}` : ""}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chat View ──────────────────────────────────────────────

function ChatView({
  conversationId,
  onApplySql,
  connectionDbml,
  onBack,
}: {
  conversationId: string;
  onApplySql: (sql: string) => void;
  connectionDbml: Record<string, unknown> | null;
  onBack: () => void;
}) {
  const { messages, sendMessage, getContent } = useMessages(conversationId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(trimmed, connectionDbml ?? undefined);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Chat header */}
      <Button
        onClick={onBack}
        variant="ghost"
        size="xs"
        leftIcon={<ArrowLeft size={12} />}
        className="justify-start"
      >
        Back to conversations
      </Button>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-2 py-1">
        {messages.length === 0 && (
          <EmptyState title="No messages yet" className="py-4" />
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            content={getContent(msg)}
            onApplySql={onApplySql}
          />
        ))}
        <AgentStatusIndicator />
      </div>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your database…"
            rows={2}
            className="pr-7"
          />
          <IconButton
            aria-label="Send"
            onClick={handleSend}
            disabled={!input.trim()}
            icon={<Send size={12} />}
            className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
            title="Send"
          />
        </div>
      </div>
    </div>
  );
}

// ── New Conversation View ──────────────────────────────────

function NewConversationView({
  onStart,
  onCancel,
}: {
  onStart: (text: string) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onStart(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <Button
        onClick={onCancel}
        variant="ghost"
        size="xs"
        leftIcon={<ArrowLeft size={12} />}
        className="justify-start"
      >
        Back
      </Button>
      <p className="text-xs text-muted-foreground">
        Start a conversation with the SQL assistant. Schema context from your active
        connection will be included automatically.
      </p>
      <div className="relative">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your database…"
          rows={3}
          className="pr-7"
          autoFocus
        />
        <IconButton
          aria-label="Start conversation"
          onClick={handleSend}
          disabled={!input.trim()}
          icon={<Send size={12} />}
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
          title="Start conversation"
        />
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────

type View = "list" | "chat" | "new";

export function AssistantPanel({ connectionDbml, onApplySql }: AssistantPanelProps) {
  const { connected, initialized, configured, error } = useEylo();
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    startConversation,
  } = useConversations();
  const [view, setView] = useState<View>("list");

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setView("chat");
  };

  const handleNewConversation = () => {
    setView("new");
  };

  const handleStartConversation = (text: string) => {
    startConversation(text, connectionDbml ?? undefined);
    setView("chat");
  };

  const handleBackToList = () => {
    setActiveConversationId(null);
    setView("list");
  };

  if (!configured) {
    return (
      <EmptyState
        icon={Bot}
        title="AI Assistant is not configured"
        description="Set the Eylo environment variables to enable it."
        className="px-2 py-8"
      />
    );
  }

  if (error) {
    return (
      <ErrorState title="Failed to connect to assistant" message={error} className="px-2 py-8" />
    );
  }

  if (!initialized) {
    return (
      <LoadingState label="Connecting to assistant" showLabel className="py-8" />
    );
  }

  if (!connected) {
    return (
      <EmptyState
        icon={Bot}
        title="Assistant disconnected"
        description="Reconnecting…"
        className="px-2 py-8"
      />
    );
  }

  if (view === "new") {
    return (
      <NewConversationView
        onStart={handleStartConversation}
        onCancel={handleBackToList}
      />
    );
  }

  if (view === "chat" && activeConversationId) {
    return (
      <ChatView
        conversationId={activeConversationId}
        onApplySql={onApplySql}
        connectionDbml={connectionDbml}
        onBack={handleBackToList}
      />
    );
  }

  return (
    <ConversationList
      conversations={conversations}
      onSelect={handleSelectConversation}
      onNew={handleNewConversation}
    />
  );
}
