import {
  matchEscalationKeywords,
  matchesRestrictedQuestion,
} from "@/core/escalation";
import {
  matchAuthorizedFaq,
  MEDICAL_ADVICE_PATTERNS,
  type ClinicFaqEntry,
  type ServiceFaqEntry,
} from "@/frontdesk/faq-engine";
import type { ChannelKind, ID, RiskLevel } from "@/types/domain";
import { materializeFaqEntries } from "@/verticals/registry";
import type { ServiceVerticalPack, VerticalLabels } from "@/verticals/types";

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

const legacyDentalLabels: VerticalLabels = {
  customer: "病人",
  customers: "病人",
  subject: "病人",
  subjects: "病人",
  resource: "医生／诊室",
  resources: "医生／诊室",
  booking: "预约",
  bookings: "预约",
  staff: "诊所职员",
  venue: "诊所",
};

function planFrontdeskCore(input: {
  tenantId: ID;
  customerId: ID;
  channel: ChannelKind;
  text: string;
  labels: VerticalLabels;
  escalationKeywords: readonly string[];
  restrictedQuestionPatterns: readonly RegExp[];
  restrictedReason: string;
  faqEntries: readonly ServiceFaqEntry[];
}): FrontdeskDecision {
  const escalation = matchEscalationKeywords(input.text, input.escalationKeywords);
  if (escalation.matched.length > 0) {
    return {
      kind: "urgent_handoff",
      risk: "high",
      appointmentIntent: null,
      autoSendAllowed: false,
      requiresHuman: true,
      suggestedReply: `已收到你的訊息，我已即時標記給${input.labels.staff}跟進。系統不會在這裡自行作專業判斷。`,
      summary: `高優先級升級訊息，命中：${escalation.matched.join("、")}。需要${input.labels.staff}立即查看原話。`,
      reasons: [
        escalation.rule ?? "ESCALATION_KEYWORD_MATCH",
        "NO_UNAUTHORIZED_PROFESSIONAL_JUDGMENT",
      ],
      matchedUrgentKeywords: escalation.matched,
      faqEntryId: null,
    };
  }

  // 受限专业问题必须早于普通 Booking 意图处理。
  // 例如“想预约，不过只狗係咪病？要唔要食药？”不能仅当成预约请求吞掉专业问题。
  if (matchesRestrictedQuestion(input.text, input.restrictedQuestionPatterns)) {
    return {
      kind: "human_handoff",
      risk: "medium",
      appointmentIntent: null,
      autoSendAllowed: false,
      requiresHuman: true,
      suggestedReply: `呢個問題需要${input.labels.staff}確認，我已經幫你轉交同事跟進。`,
      summary: "訊息包含行業包標記為受限的專業問題，已轉人工。",
      reasons: [input.restrictedReason, "NO_UNAUTHORIZED_PROFESSIONAL_JUDGMENT"],
      matchedUrgentKeywords: [],
      faqEntryId: null,
    };
  }

  const appointmentIntent = detectAppointmentIntent(input.text);
  if (appointmentIntent) {
    const labels: Record<Exclude<AppointmentIntent, null>, string> = {
      confirm: `確認${input.labels.booking}`,
      reschedule: "要求改期",
      cancel: `要求取消${input.labels.booking}`,
      book: `查詢新${input.labels.booking}`,
    };
    const replies: Record<Exclude<AppointmentIntent, null>, string> = {
      confirm: `收到，我會先核對你的${input.labels.booking}資料，再為你確認。`,
      reschedule: `可以，我會先核對你的${input.labels.booking}，再查詢可用時段供你選擇。`,
      cancel: `可以，我會先核對你要取消的${input.labels.booking}；接近服務時間的取消可能需要${input.labels.staff}確認。`,
      book: `可以，我會先查詢可用時段。你亦可以告訴我偏好的日期或時間。`,
    };

    return {
      kind: "appointment_request",
      risk: appointmentIntent === "cancel" ? "medium" : "low",
      appointmentIntent,
      autoSendAllowed: appointmentIntent !== "cancel",
      requiresHuman: false,
      suggestedReply: replies[appointmentIntent],
      summary: labels[appointmentIntent],
      reasons: ["BOOKING_INTENT_MATCH", "REQUIRES_BOOKING_ADAPTER"],
      matchedUrgentKeywords: [],
      faqEntryId: null,
    };
  }

  const faq = matchAuthorizedFaq({
    tenantId: input.tenantId,
    channel: input.channel,
    text: input.text,
    entries: input.faqEntries,
    blockedPatterns: input.restrictedQuestionPatterns,
    blockedReason: input.restrictedReason,
  });
  if (faq.kind === "answer") {
    return {
      kind: "faq_reply",
      risk: "low",
      appointmentIntent: null,
      autoSendAllowed: true,
      requiresHuman: false,
      suggestedReply: faq.answer ?? null,
      summary: "命中商戶已授權的行政／服務 FAQ，可直接回覆。",
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
    suggestedReply: `呢個問題需要${input.labels.staff}確認，我已經幫你轉交同事跟進。`,
    summary: "未命中已授權 FAQ 或明確服務流程，轉交人工。",
    reasons: [faq.reason, "FAIL_CLOSED_TO_HUMAN"],
    matchedUrgentKeywords: [],
    faqEntryId: null,
  };
}

/**
 * 新通用入口：Core 只读取 Vertical Pack，不知道当前是牙科、宠物、汽车还是家居服务。
 */
export function planServiceFrontdeskMessage(input: {
  tenantId: ID;
  customerId: ID;
  channel: ChannelKind;
  text: string;
  vertical: ServiceVerticalPack;
}): FrontdeskDecision {
  return planFrontdeskCore({
    tenantId: input.tenantId,
    customerId: input.customerId,
    channel: input.channel,
    text: input.text,
    labels: input.vertical.labels,
    escalationKeywords: input.vertical.escalationKeywords,
    restrictedQuestionPatterns: input.vertical.restrictedQuestionPatterns,
    restrictedReason: "VERTICAL_RESTRICTED_QUESTION_REQUIRES_HUMAN",
    faqEntries: materializeFaqEntries(input.vertical, input.tenantId),
  });
}

/**
 * 第一版牙科兼容入口。现有调用无需立刻迁移；新功能优先使用 planServiceFrontdeskMessage。
 */
export function planFrontdeskMessage(input: {
  clinicId: ID;
  patientId: ID;
  channel: ChannelKind;
  text: string;
  urgentKeywords: readonly string[];
  faqEntries: readonly ClinicFaqEntry[];
}): FrontdeskDecision {
  return planFrontdeskCore({
    tenantId: input.clinicId,
    customerId: input.patientId,
    channel: input.channel,
    text: input.text,
    labels: legacyDentalLabels,
    escalationKeywords: input.urgentKeywords,
    restrictedQuestionPatterns: MEDICAL_ADVICE_PATTERNS,
    restrictedReason: "MEDICAL_ADVICE_REQUEST_REQUIRES_HUMAN",
    faqEntries: input.faqEntries,
  });
}
