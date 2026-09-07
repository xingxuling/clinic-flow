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

export function useServiceConversations(input: {
  tenantId: string;
  vertical: ServiceVerticalPack;
  legacyConversations: readonly Conversation[];
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

  return { conversations };
}
