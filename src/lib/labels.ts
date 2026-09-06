import type {
  AgentTaskStatus,
  AppointmentStatus,
  ChannelKind,
  ConversationState,
  DocumentKind,
  DocumentStatus,
  ReminderKind,
  ReminderStatus,
  RiskLevel,
} from "@/types/domain";

export type Tone = "primary" | "secondary" | "tertiary" | "error" | "neutral";

export const APPOINTMENT_STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  pending: { label: "待確認", tone: "tertiary" },
  confirmed: { label: "已確認", tone: "primary" },
  arrived: { label: "已到診", tone: "secondary" },
  no_show: { label: "失約", tone: "error" },
  cancelled: { label: "已取消", tone: "neutral" },
};

export const CONVERSATION_STATE: Record<ConversationState, { label: string; tone: Tone }> = {
  agent_handling: { label: "Agent 處理中", tone: "primary" },
  waiting_human: { label: "等待人手", tone: "tertiary" },
  human: { label: "人手跟進", tone: "secondary" },
  closed: { label: "已完結", tone: "neutral" },
};

export const AGENT_STATUS: Record<AgentTaskStatus, { label: string; tone: Tone }> = {
  auto_running: { label: "自動執行中", tone: "primary" },
  waiting_approval: { label: "等待人工批准", tone: "tertiary" },
  failed: { label: "失敗", tone: "error" },
  done: { label: "已完成", tone: "secondary" },
  rejected: { label: "已否決", tone: "neutral" },
};

export const RISK: Record<RiskLevel, { label: string; tone: Tone }> = {
  low: { label: "低風險", tone: "secondary" },
  medium: { label: "中風險", tone: "tertiary" },
  high: { label: "高風險・須人工批准", tone: "error" },
};

export const CHANNEL: Record<ChannelKind, string> = {
  whatsapp: "WhatsApp",
  phone: "電話",
  web: "網頁",
};

export const REMINDER_KIND: Record<ReminderKind, string> = {
  pre_visit: "就診前提醒",
  recall_cleaning: "洗牙召回",
  vaccine: "疫苗／覆診",
  followup: "覆診跟進",
  no_reply: "未回覆跟進",
};

export const REMINDER_STATUS: Record<ReminderStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "已排程", tone: "primary" },
  sent: { label: "已發送", tone: "secondary" },
  replied: { label: "已回覆", tone: "secondary" },
  overdue: { label: "逾期", tone: "error" },
  cancelled: { label: "已取消", tone: "neutral" },
};

export const DOCUMENT_KIND: Record<DocumentKind, string> = {
  insurance_form: "保險表格",
  referral: "轉介信",
  receipt: "收據",
  invoice: "發票",
};

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: Tone }> = {
  draft: { label: "草稿", tone: "neutral" },
  needs_fields: { label: "缺欄位", tone: "tertiary" },
  anomaly: { label: "異常", tone: "error" },
  ready: { label: "可發出", tone: "primary" },
  sent: { label: "已發出", tone: "secondary" },
};

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-HK", { month: "numeric", day: "numeric" });
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function fmtWeekday(iso: string): string {
  return "週" + "日一二三四五六"[new Date(iso).getDay()];
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
