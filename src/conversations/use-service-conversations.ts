import { useEffect, useMemo, useState } from "react";

import {
  SERVICE_CONVERSATIONS_CHANGED_EVENT,
  serviceConversationRepository,
} from "@/conversations/repository";
import {
  conversationToServiceConversation,
  type ServiceConversation,
} from "@/conversations/types";
import type { Conversation } from "@/types/domain";
import type { ServiceVerticalPack } from "@/verticals/types";

interface LegacyConversationActions {
  takeOver: (conversationId: string) => void;
  sendReply: (conversationId: string, text: string) => void;
  sendAgentDraft: (conversationId: string, messageId: string) => void;
}

export function useServiceConversations(input: {
  tenantId: string;
  vertical: ServiceVerticalPack;
  legacyConversations: readonly Conversation[];
  legacyActions?: LegacyConversationActions;
}) {
  const [persisted, setPersisted] = useState<ServiceConversation[]>([]);

  useEffect(() => {
    const refresh = () =>
      setPersisted(serviceConversationRepository.list(input.tenantId, input.vertical.id));
    refresh();
    window.addEventListener(SERVICE_CONVERSATIONS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SERVICE_CONVERSATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [input.tenantId, input.vertical.id]);

  const conversations = useMemo(() => {
    const rows = new Map<string, ServiceConversation>();
    if (input.vertical.id === "dental") {
      for (const conversation of input.legacyConversations) {
        const row = conversationToServiceConversation(conversation);
        if (row.verticalId === "dental") rows.set(row.id, row);
      }
    }
    for (const conversation of persisted) rows.set(conversation.id, conversation);
    return [...rows.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [input.legacyConversations, input.vertical.id, persisted]);

  const takeOver = (conversationId: string, staffId: string): boolean => {
    const conversation = conversations.find((row) => row.id === conversationId);
    if (!conversation) return false;
    if (conversation.source === "legacy_conversation_compat") {
      input.legacyActions?.takeOver(conversationId);
      return Boolean(input.legacyActions);
    }
    return Boolean(
      serviceConversationRepository.update(input.tenantId, conversationId, {
        state: "human",
        assignedTo: staffId,
        unread: false,
      }),
    );
  };

  const sendStaffReply = (inputMessage: {
    conversationId: string;
    staffId: string;
    staffName: string;
    text: string;
  }): boolean => {
    const conversation = conversations.find((row) => row.id === inputMessage.conversationId);
    if (!conversation || !inputMessage.text.trim()) return false;
    if (conversation.source === "legacy_conversation_compat") {
      input.legacyActions?.sendReply(inputMessage.conversationId, inputMessage.text.trim());
      return Boolean(input.legacyActions);
    }

    serviceConversationRepository.appendMessage({
      tenantId: input.tenantId,
      verticalId: input.vertical.id,
      customerId: conversation.customerId,
      channel: conversation.channel,
      from: "staff",
      authorName: inputMessage.staffName,
      text: inputMessage.text.trim(),
      at: new Date().toISOString(),
      state: "human",
      unread: false,
    });
    serviceConversationRepository.update(input.tenantId, conversation.id, {
      state: "human",
      assignedTo: inputMessage.staffId,
      unread: false,
    });
    return true;
  };

  const approveLegacyAgentDraft = (conversationId: string, messageId: string): boolean => {
    const conversation = conversations.find((row) => row.id === conversationId);
    if (!conversation || conversation.source !== "legacy_conversation_compat") return false;
    input.legacyActions?.sendAgentDraft(conversationId, messageId);
    return Boolean(input.legacyActions);
  };

  return { conversations, takeOver, sendStaffReply, approveLegacyAgentDraft };
}
