import type { TContact } from "../contact";
import type { TCompoundWidgetPayload, TWidgetPayloadEnvelope, TWidgetValidationIssue } from "../interface";
import type { TParticipant } from "../participant";

type TMessageKind = "USER" | "SYSTEM" | "ASSISTANT" | "TOOL_USE" | "TOOL_RESULT";

type TMessageContentKind =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "TOOL"
  | "TOOL_RESULT"
  | "WIDGET"
  | "WIDGET_RESPONSE";

// Content block types
type TTextContent = {
  type: "text";
  text: string;
};

type TImageContent = {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type: string;
    data: string;
  };
};

type TToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type TToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<TTextContent | TImageContent>;
  is_error?: boolean;
};

// Message content types based on Python schemas
type TUserMessageContent = {
  role: "user";
  content: string | TTextContent[];
};

type TAssistantMessageContent = {
  role: "assistant";
  content: TTextContent | string | Record<string, unknown>;
};

type TToolUseMessageContent = {
  role: "assistant";
  content: TToolUseContent;
};

type TToolResultMessageContent = {
  role: "user";
  content: TToolResultContent[];
};

type TSystemMessageContent = {
  role: "system";
  content: string;
};

type TWidgetMessageContent = {
  role: "assistant";
  content: TWidgetPayloadEnvelope | TCompoundWidgetPayload;
};

type TWidgetResponseData = {
  type: "widget_response";
  widget_message_id: string;
  component: string;
  action?: string;
  data: Record<string, unknown>;
};

type TWidgetResponseMessageContent = {
  role: "user";
  content: TWidgetResponseData;
};

type TMessageContent =
  | TUserMessageContent
  | TAssistantMessageContent
  | TToolUseMessageContent
  | TToolResultMessageContent
  | TSystemMessageContent
  | TWidgetMessageContent
  | TWidgetResponseMessageContent;

type TMessageWidgetMeta = {
  widgetPayload?: TWidgetPayloadEnvelope | TCompoundWidgetPayload;
  widgetPayloadIssues?: TWidgetValidationIssue[];
};

type TMessage = {
  id: string;
  conversationId: string;
  senderParticipantId: string;
  kind: TMessageKind;
  contentKind: TMessageContentKind;
  content: TMessageContent | Record<string, unknown>;
  htmlContent?: string;
  parentMessageId?: string;
  meta?: Record<string, unknown> & TMessageWidgetMeta;
  externalId?: string;
  requestId?: string;
  requestFeedback?: string;
  createdAt: Date;
};

type TMessageWParticipant = TMessage & {
  senderParticipant?: TParticipant;
  contact?: TContact;
};

type TMessageCreate = {
  conversationId: string;
  text: string;
  context?: Record<string, unknown>;
};

type TWidgetResponseMessageCreate = {
  conversationId: string;
  widgetMessageId: string;
  component: string;
  action: string;
  data: Record<string, unknown>;
};

export type {
  TAssistantMessageContent,
  TImageContent,
  TMessage,
  TMessageContent,
  TMessageContentKind,
  TMessageCreate,
  TMessageKind, TMessageWidgetMeta, TMessageWParticipant,
  TSystemMessageContent,
  TTextContent,
  TToolResultContent,
  TToolResultMessageContent,
  TToolUseContent,
  TToolUseMessageContent,
  TUserMessageContent,
  TWidgetMessageContent, TWidgetResponseData,
  TWidgetResponseMessageContent, TWidgetResponseMessageCreate
};
