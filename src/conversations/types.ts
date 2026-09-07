import type { ChannelKind, Conversation, ConversationState } from "@/types/domain";
import { entityVerticalId } from "@/verticals/entity-scope";

export type ServiceConversationState = ConversationState;
export type ServiceMessageFrom = "customer" | "staff" | "agent";

export interface ServiceConversationMessage {
  id: string;
  from: ServiceMessageFrom;
  authorName: string;
  text: string;
  at: string;
  providerMessageId?: string;
  draft?: boolean;
}

export interface ServiceConversation {
  id: string;
  tenantId: string;
  verticalId: string;
  customerId: string;
  channel: ChannelKind;
  subject: string;
  state: ServiceConversationState;
  unread: boolean;
  lastAt: string;
  messages: ServiceConversationMessage[];
  assignedTo?: string;
  source: "legacy_conversation_compat" | "messaging_adapter" | "manual";
}

export function conversationToServiceConversation(conversation: Conversation): ServiceConversation {
  return {
    id: conversation.id,
    tenantId: conversation.clinicId,
    verticalId: entityVerticalId(conversation),
    customerId: conversation.patientId,
    channel: conversation.channel,
    subject: conversation.subject,
    state: conversation.state,
    unread: conversation.unread,
    lastAt: conversation.lastAt,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      from: message.from === "patient" ? "customer" : message.from,
      authorName: message.authorName,
      text: message.text,
      at: message.at,
      ...(message.draft === undefined ? {} : { draft: message.draft }),
    })),
    ...(conversation.assignedTo ? { assignedTo: conversation.assignedTo } : {}),
    source: "legacy_conversation_compat",
  };
}
