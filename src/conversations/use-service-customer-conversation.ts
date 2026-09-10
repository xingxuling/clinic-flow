import { useEffect, useState } from "react";

import {
  SERVICE_CONVERSATIONS_CHANGED_EVENT,
  serviceConversationRepository,
} from "@/conversations/repository";
import type { ServiceConversation } from "@/conversations/types";

/**
 * Customer Portal 的最小本地会话投影。
 *
 * 只按 tenant + vertical + customer 取自己的网页会话，并监听同页与跨 tab
 * 更新，让员工回复或 Agent 自动回复可以回到客户画面。
 */
export function useServiceCustomerConversation(input: {
  tenantId: string;
  verticalId: string;
  customerId: string;
}) {
  const [conversation, setConversation] = useState<ServiceConversation | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (!input.customerId) {
        setConversation(null);
        return;
      }
      const next = serviceConversationRepository
        .list(input.tenantId, input.verticalId)
        .find((row) => row.customerId === input.customerId && row.channel === "web");
      setConversation(next ?? null);
    };

    refresh();
    window.addEventListener(SERVICE_CONVERSATIONS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SERVICE_CONVERSATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [input.customerId, input.tenantId, input.verticalId]);

  return conversation;
}
