import {
  planServiceFrontdeskMessage,
  type FrontdeskDecision,
} from "@/frontdesk/frontdesk-agent";
import type { Clinic, Conversation, Message } from "@/types/domain";
import { resolveVerticalPackForClinic } from "@/verticals/registry";

export interface AdministrativeConversationSummary {
  title: string;
  detail: string;
  nextAction: string;
  decision: FrontdeskDecision;
}

function latestCustomerMessage(messages: readonly Message[]): Message | null {
  // 现有数据库字段仍叫 patient；通用核心把它视为 customer。
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.from === "patient") return message;
  }
  return null;
}

/**
 * 前台摘要只总结行政/服务意图与下一步，不生成未授权专业判断。
 */
export function summarizeConversationForFrontdesk(input: {
  clinic: Clinic;
  conversation: Conversation;
}): AdministrativeConversationSummary {
  const vertical = resolveVerticalPackForClinic(input.clinic);
  const customerMessage = latestCustomerMessage(input.conversation.messages);

  if (!customerMessage) {
    return {
      title: `暫無新的${vertical.labels.customer}訊息`,
      detail: `目前對話最後內容不是由${vertical.labels.customer}發出。`,
      nextAction: "等待新訊息或由前台繼續處理。",
      decision: {
        kind: "human_handoff",
        risk: "medium",
        appointmentIntent: null,
        autoSendAllowed: false,
        requiresHuman: true,
        suggestedReply: null,
        summary: `沒有可分析的最新${vertical.labels.customer}訊息。`,
        reasons: ["NO_CUSTOMER_MESSAGE"],
        matchedUrgentKeywords: [],
        faqEntryId: null,
      },
    };
  }

  const decision = planServiceFrontdeskMessage({
    tenantId: input.clinic.id,
    customerId: input.conversation.patientId,
    channel: input.conversation.channel,
    text: customerMessage.text,
    vertical,
  });

  if (decision.kind === "urgent_handoff") {
    return {
      title: "需要立即人工查看",
      detail: decision.summary,
      nextAction: `查看${vertical.labels.customer}原話並立即由${vertical.labels.staff}接管；系統不作未授權專業判斷。`,
      decision,
    };
  }

  if (decision.kind === "appointment_request") {
    const nextActionByIntent = {
      confirm: `核對現有${vertical.labels.booking}後確認。`,
      reschedule: `核對現有${vertical.labels.booking}並查詢可用時段。`,
      cancel: `核對要取消的${vertical.labels.booking}；按商戶規則決定是否需要人工批准。`,
      book: "詢問偏好日期／時段並查詢空檔。",
    } as const;

    return {
      title: decision.summary,
      detail: `最新${vertical.labels.customer}訊息：「${customerMessage.text}」`,
      nextAction: decision.appointmentIntent
        ? nextActionByIntent[decision.appointmentIntent]
        : "由前台確認下一步。",
      decision,
    };
  }

  if (decision.kind === "faq_reply") {
    return {
      title: "可由 FAQ 自動回覆",
      detail: decision.summary,
      nextAction: "可發送商戶已授權答案；不生成新的未授權專業內容。",
      decision,
    };
  }

  return {
    title: "需要前台確認",
    detail: decision.summary,
    nextAction: "人工接管，必要時補充成新的商戶授權 FAQ。",
    decision,
  };
}
