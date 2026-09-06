import { detectUrgent } from "@/lib/agent-rules";
import { matchClinicFaq, type ClinicFaqEntry } from "@/frontdesk/faq-engine";
import type { ChannelKind, ID, RiskLevel } from "@/types/domain";

export type AppointmentIntent = "confirm" | "reschedule" | "cancel" | "book" | null;

export type FrontdeskDecisionKind =
  | "urgent_handoff"
  | "appointment_request"
  | "faq_reply"
  | "human_handoff";

export interface FrontdeskDecision {
  kind: FrontdeskDecisionKind;
  risk: RiskLevel;
  appointmentIntent: AppointmentIntent;
  autoSendAllowed: boolean;
  requiresHuman: boolean;
  suggestedReply: string | null;
  summary: string;
  reasons: string[];
  matchedUrgentKeywords: string[];
  faqEntryId: string | null;
}

function detectAppointmentIntent(text: string): AppointmentIntent {
  const normalized = text.toLocaleLowerCase("zh-HK");

  if (/取消|唔去|不去|cancel/u.test(normalized)) return "cancel";
  if (/改期|改時間|改时间|轉時間|转时间|換日子|换日子|reschedule/u.test(normalized)) {
    return "reschedule";
  }
  if (/確認|确认|會到|会到|到時見|到时见|confirm/u.test(normalized)) return "confirm";
  if (/預約|预约|想約|想约|有冇位|有没有位|book/u.test(normalized)) return "book";
  return null;
}

/**
 * 第一阶段 AI 前台的纯规划器。
 *
 * 优先级：紧急信号 > 预约意图 > 诊所授权 FAQ > 人工接管。
 * 它不直接修改预约、不直接调用 WhatsApp，也不产生临床判断。
 */
export function planFrontdeskMessage(input: {
  clinicId: ID;
  patientId: ID;
  channel: ChannelKind;
  text: string;
  urgentKeywords: readonly string[];
  faqEntries: readonly ClinicFaqEntry[];
}): FrontdeskDecision {
  const urgent = detectUrgent(input.text, [...input.urgentKeywords]);
  if (urgent.matched.length > 0) {
    return {
      kind: "urgent_handoff",
      risk: "high",
      appointmentIntent: null,
      autoSendAllowed: false,
      requiresHuman: true,
      suggestedReply: "已收到你的訊息，我已即時標記給診所職員跟進。系統不會在這裡作醫療判斷。",
      summary: `潛在緊急訊息，命中：${urgent.matched.join("、")}。需要診所人員立即查看原話。`,
      reasons: [urgent.rule ?? "URGENT_KEYWORD_MATCH", "NO_MEDICAL_DIAGNOSIS"],
      matchedUrgentKeywords: urgent.matched,
      faqEntryId: null,
    };
  }

  const appointmentIntent = detectAppointmentIntent(input.text);
  if (appointmentIntent) {
    const labels: Record<Exclude<AppointmentIntent, null>, string> = {
      confirm: "確認預約",
      reschedule: "要求改期",
      cancel: "要求取消預約",
      book: "查詢新預約",
    };
    const replies: Record<Exclude<AppointmentIntent, null>, string> = {
      confirm: "收到，我會先核對你的預約資料，再為你確認。",
      reschedule: "可以，我會先核對你的預約，再查詢可用時段供你選擇。",
      cancel: "可以，我會先核對你要取消的預約；接近應診時間的取消可能需要診所職員確認。",
      book: "可以，我會先查詢可預約時段。你亦可以告訴我偏好的日期或時段。",
    };

    return {
      kind: "appointment_request",
      risk: appointmentIntent === "cancel" ? "medium" : "low",
      appointmentIntent,
      autoSendAllowed: appointmentIntent !== "cancel",
      requiresHuman: false,
      suggestedReply: replies[appointmentIntent],
      summary: labels[appointmentIntent],
      reasons: ["APPOINTMENT_INTENT_MATCH", "REQUIRES_APPOINTMENT_ADAPTER"],
      matchedUrgentKeywords: [],
      faqEntryId: null,
    };
  }

  const faq = matchClinicFaq({
    clinicId: input.clinicId,
    channel: input.channel,
    text: input.text,
    entries: input.faqEntries,
  });
  if (faq.kind === "answer") {
    return {
      kind: "faq_reply",
      risk: "low",
      appointmentIntent: null,
      autoSendAllowed: true,
      requiresHuman: false,
      suggestedReply: faq.answer ?? null,
      summary: "命中診所已授權的行政 FAQ，可直接回覆。",
      reasons: [faq.reason, `FAQ_SCORE_${faq.score.toFixed(2)}`],
      matchedUrgentKeywords: [],
      faqEntryId: faq.entryId ?? null,
    };
  }

  return {
    kind: "human_handoff",
    risk: "medium",
    appointmentIntent: null,
    autoSendAllowed: false,
    requiresHuman: true,
    suggestedReply: "呢個問題需要診所職員確認，我已經幫你轉交同事跟進。",
    summary: "未命中已授權 FAQ 或明確行政流程，轉交前台。",
    reasons: [faq.reason, "FAIL_CLOSED_TO_HUMAN"],
    matchedUrgentKeywords: [],
    faqEntryId: null,
  };
}
