import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageSquarePlus, Send, ArrowLeft, Code } from "lucide-react";
import DOMPurify from "dompurify";
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
      <button
        onClick={onNew}
        className="mx-2 mb-1 flex h-7 items-center gap-1.5 rounded border border-input px-2 text-xs text-muted-foreground hover:bg-accent"
      >
        <MessageSquarePlus size={12} />
        New Conversation
      </button>
      {conversations.length === 0 && (
        <p className="px-2 py-3 text-center text-xs text-muted-foreground/60">
          No conversations yet
        </p>
      )}
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className="flex flex-col gap-0.5 border-b border-border px-2 py-1.5 text-left hover:bg-accent/50"
        >
          <span className="truncate text-xs font-medium">
            {conv.title || "Untitled"}
          </span>
          <span className="text-[0.75rem] text-muted-foreground">
            {new Date(conv.createdAt).toLocaleDateString()}
          </span>
        </button>
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
            <button
              key={i}
              onClick={() => onApplySql(block)}
              className="flex items-center gap-0.5 rounded bg-accent/50 px-1.5 py-0.5 text-[0.75rem] text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Apply to editor"
            >
              <Code size={9} />
              Apply SQL{sqlBlocks.length > 1 ? ` #${i + 1}` : ""}
            </button>
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
      <button
        onClick={onBack}
        className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} />
        Back to conversations
      </button>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-2 py-1">
        {messages.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground/60">
            No messages yet
          </p>
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
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your database…"
            rows={2}
            className="w-full resize-none rounded border border-input bg-transparent px-2 py-1.5 pr-7 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
            title="Send"
          >
            <Send size={12} />
          </button>
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
      <button
        onClick={onCancel}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} />
        Back
      </button>
      <p className="text-xs text-muted-foreground">
        Start a conversation with the SQL assistant. Schema context from your active
        connection will be included automatically.
      </p>
      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your database…"
          rows={3}
          className="w-full resize-none rounded border border-input bg-transparent px-2 py-1.5 pr-7 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
          title="Start conversation"
        >
          <Send size={12} />
        </button>
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
      <div className="flex flex-col items-center gap-2 px-2 py-8">
        <Bot size={16} className="text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground text-center">
          AI Assistant is not configured. Set the Eylo environment variables to enable it.
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8">
        <Bot size={16} className="text-destructive/60" />
        <span className="text-xs text-destructive/80 text-center">
          Failed to connect to assistant
        </span>
        <span className="text-[0.75rem] text-muted-foreground text-center">
          {error}
        </span>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Connecting to assistant…</span>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-8">
        <Bot size={16} className="text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">
          Assistant disconnected. Reconnecting…
        </span>
      </div>
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

