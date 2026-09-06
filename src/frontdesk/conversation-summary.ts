import { demoDentalFaq } from "@/frontdesk/faq-seed";
import { planFrontdeskMessage, type FrontdeskDecision } from "@/frontdesk/frontdesk-agent";
import type { Clinic, Conversation, Message } from "@/types/domain";

export interface AdministrativeConversationSummary {
  title: string;
  detail: string;
  nextAction: string;
  decision: FrontdeskDecision;
}

function latestPatientMessage(messages: readonly Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.from === "patient") return message;
  }
  return null;
}

/**
 * 前台摘要只总结行政意图与下一步，不生成病情、诊断、治疗或临床分流结论。
 */
export function summarizeConversationForFrontdesk(input: {
  clinic: Clinic;
  conversation: Conversation;
}): AdministrativeConversationSummary {
  const patientMessage = latestPatientMessage(input.conversation.messages);
  if (!patientMessage) {
    return {
      title: "暫無新的病人訊息",
      detail: "目前對話最後內容不是由病人發出。",
      nextAction: "等待新訊息或由前台繼續處理。",
      decision: {
        kind: "human_handoff",
        risk: "medium",
        appointmentIntent: null,
        autoSendAllowed: false,
        requiresHuman: true,
        suggestedReply: null,
        summary: "沒有可分析的最新病人訊息。",
        reasons: ["NO_PATIENT_MESSAGE"],
        matchedUrgentKeywords: [],
        faqEntryId: null,
      },
    };
  }

  const decision = planFrontdeskMessage({
    clinicId: input.clinic.id,
    patientId: input.conversation.patientId,
    channel: input.conversation.channel,
    text: patientMessage.text,
    urgentKeywords: input.clinic.settings.urgentKeywords,
    faqEntries: demoDentalFaq,
  });

  if (decision.kind === "urgent_handoff") {
    return {
      title: "需要立即人工查看",
      detail: decision.summary,
      nextAction: "查看病人原话并立即由诊所人员接管；系统不作医疗判断。",
      decision,
    };
  }

  if (decision.kind === "appointment_request") {
    const nextActionByIntent = {
      confirm: "核对现有预约后确认。",
      reschedule: "核对现有预约并查询可用时段。",
      cancel: "核对要取消的预约；按诊所规则决定是否需要人工批准。",
      book: "询问偏好日期/时段并查询空档。",
    } as const;

    return {
      title: decision.summary,
      detail: `最新病人讯息：「${patientMessage.text}」`,
      nextAction: decision.appointmentIntent
        ? nextActionByIntent[decision.appointmentIntent]
        : "由前台确认下一步。",
      decision,
    };
  }

  if (decision.kind === "faq_reply") {
    return {
      title: "可由 FAQ 自动回复",
      detail: decision.summary,
      nextAction: "可发送诊所已授权答案；无需生成新的医疗内容。",
      decision,
    };
  }

  return {
    title: "需要前台确认",
    detail: decision.summary,
    nextAction: "人工接管，必要时补充成新的诊所授权 FAQ。",
    decision,
  };
}
