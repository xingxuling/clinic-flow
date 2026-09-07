import type { ServiceConversation } from "@/conversations/types";
import {
  planServiceFrontdeskMessage,
  type FrontdeskDecision,
} from "@/frontdesk/frontdesk-agent";
import type { Clinic, Conversation } from "@/types/domain";
import { resolveVerticalPackForClinic } from "@/verticals/registry";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface AdministrativeConversationSummary {
  title: string;
  detail: string;
  nextAction: string;
  decision: FrontdeskDecision;
}

interface SummarizableMessage {
  from: "customer" | "patient" | "staff" | "agent";
  text: string;
}

function latestCustomerMessage(messages: readonly SummarizableMessage[]): SummarizableMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.from === "customer" || message?.from === "patient") return message;
  }
  return null;
}

function summarize(input: {
  tenantId: string;
  customerId: string;
  channel: ServiceConversation["channel"];
  messages: readonly SummarizableMessage[];
  vertical: ServiceVerticalPack;
}): AdministrativeConversationSummary {
  const customerMessage = latestCustomerMessage(input.messages);
  const vertical = input.vertical;

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
    tenantId: input.tenantId,
    customerId: input.customerId,
    channel: input.channel,
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
      book: `詢問偏好日期／時段並查詢${vertical.labels.booking}空檔。`,
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

/** 通用 Service Conversation 原生摘要入口。 */
export function summarizeServiceConversationForFrontdesk(input: {
  tenantId: string;
  conversation: ServiceConversation;
  vertical: ServiceVerticalPack;
}): AdministrativeConversationSummary {
  return summarize({
    tenantId: input.tenantId,
    customerId: input.conversation.customerId,
    channel: input.conversation.channel,
    messages: input.conversation.messages,
    vertical: input.vertical,
  });
}

/**
 * Dental / Clinic 旧数据兼容入口。
 * 新行业优先使用 summarizeServiceConversationForFrontdesk。
 */
export function summarizeConversationForFrontdesk(input: {
  clinic: Clinic;
  conversation: Conversation;
  vertical?: ServiceVerticalPack;
}): AdministrativeConversationSummary {
  const vertical = input.vertical ?? resolveVerticalPackForClinic(input.clinic);
  return summarize({
    tenantId: input.clinic.id,
    customerId: input.conversation.patientId,
    channel: input.conversation.channel,
    messages: input.conversation.messages,
    vertical,
  });
}
