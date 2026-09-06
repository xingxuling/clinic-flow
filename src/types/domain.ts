/**
 * 「诊所行政 Agent」领域类型定义
 *
 * 设计原则：
 * - 多租户：所有实体都带 clinicId，任何查询都必须先按 clinicId 收窄。
 * - 行政边界：本系统只处理行政资料，不储存诊断、病历内容或影像。
 * - 状态显式化：关键对象使用明确的状态机 union，而非布尔散点。
 */

export type ID = string;
export type ISODateTime = string; // e.g. 2026-09-06T14:30:00+08:00

/* ---------------------------------- 诊所 ---------------------------------- */

export type ClinicKind = "dental" | "clinic" | "physio";

export interface BusinessHour {
  /** 0 = 星期日 */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  open: string; // "09:30"
  close: string; // "18:30"
  closed: boolean;
}

export interface ServiceType {
  id: ID;
  name: string;
  durationMin: number;
  colorToken: "primary" | "secondary" | "tertiary" | "error";
}

export interface ClinicSettings {
  reminderLeadHours: number[];
  recallMonths: number[];
  urgentKeywords: string[];
  channels: { channel: ChannelKind; connected: boolean; note: string }[];
  privacy: {
    storeMedicalNotes: boolean;
    retentionDays: number;
    maskPhoneInLists: boolean;
  };
}

export interface Clinic {
  id: ID;
  name: string;
  kind: ClinicKind;
  district: string;
  phone: string;
  timezone: string;
  businessHours: BusinessHour[];
  services: ServiceType[];
  settings: ClinicSettings;
}

/* ---------------------------------- 员工 ---------------------------------- */

export type StaffRole = "owner" | "practitioner" | "nurse" | "reception" | "finance" | "readonly";

export type Permission =
  | "patient.read"
  | "patient.write"
  | "appointment.read"
  | "appointment.write"
  | "conversation.read"
  | "conversation.reply"
  | "agent.approve"
  | "document.read"
  | "document.write"
  | "staff.manage"
  | "audit.read"
  | "settings.write";

export interface Staff {
  id: ID;
  clinicId: ID;
  name: string;
  role: StaffRole;
  title: string;
  email: string;
  active: boolean;
  lastActiveAt: ISODateTime;
}

/* ---------------------------------- 邀请 ---------------------------------- */

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invite {
  id: ID;
  clinicId: ID;
  code: string;
  role: StaffRole;
  inviteeName: string;
  status: InviteStatus;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  boundDevice?: string;
}

/* ---------------------------------- 病人 ---------------------------------- */

export interface Patient {
  id: ID;
  clinicId: ID;
  /** 行政档案编号，非身份证 */
  fileNo: string;
  name: string;
  phone: string;
  preferredChannel: ChannelKind;
  language: "zh-HK" | "zh-CN" | "en";
  tags: string[];
  lastVisitAt?: ISODateTime;
  nextRecallAt?: ISODateTime;
  notesAdmin: string;
}

/* --------------------------------- 预约 ----------------------------------- */

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "no_show"
  | "cancelled";

export interface Appointment {
  id: ID;
  clinicId: ID;
  patientId: ID;
  practitionerId: ID;
  serviceId: ID;
  startAt: ISODateTime;
  endAt: ISODateTime;
  status: AppointmentStatus;
  room: string;
  note: string;
  createdBy: ActorRef;
}

/* --------------------------------- 对话 ----------------------------------- */

export type ChannelKind = "whatsapp" | "phone" | "web";

export type ConversationState = "agent_handling" | "waiting_human" | "human" | "closed";

export interface Message {
  id: ID;
  conversationId: ID;
  from: "patient" | "staff" | "agent";
  authorName: string;
  text: string;
  at: ISODateTime;
  /** Agent 建议草稿，尚未发送 */
  draft?: boolean;
}

export interface Conversation {
  id: ID;
  clinicId: ID;
  patientId: ID;
  channel: ChannelKind;
  subject: string;
  state: ConversationState;
  unread: boolean;
  urgentFlagId?: ID;
  lastAt: ISODateTime;
  messages: Message[];
  assignedTo?: ID;
}

/* ------------------------------- 紧急标记 --------------------------------- */

/**
 * 只做「潜在紧急」关键词/规则标记。
 * 不产生医学诊断、不做自动分诊结论，一律显示病人原话与触发原因。
 */
export interface UrgentFlag {
  id: ID;
  clinicId: ID;
  conversationId: ID;
  patientId: ID;
  quote: string;
  matchedKeywords: string[];
  rule: string;
  raisedAt: ISODateTime;
  handledBy?: ID;
  handledAt?: ISODateTime;
}

/* ------------------------------ Agent 任务 -------------------------------- */

export type AgentTaskStatus = "auto_running" | "waiting_approval" | "failed" | "done" | "rejected";
export type RiskLevel = "low" | "medium" | "high";

export interface AgentTask {
  id: ID;
  clinicId: ID;
  title: string;
  /** 准备做什么 */
  intent: string;
  /** 依据什么 */
  basis: string[];
  /** 会修改什么 */
  effects: string[];
  risk: RiskLevel;
  status: AgentTaskStatus;
  createdAt: ISODateTime;
  relatedPatientId?: ID;
  relatedConversationId?: ID;
  failureReason?: string;
  decidedBy?: ID;
  decidedAt?: ISODateTime;
}

/* -------------------------------- 提醒召回 -------------------------------- */

export type ReminderKind = "pre_visit" | "recall_cleaning" | "vaccine" | "followup" | "no_reply";
export type ReminderStatus = "scheduled" | "sent" | "replied" | "overdue" | "cancelled";

export interface Reminder {
  id: ID;
  clinicId: ID;
  patientId: ID;
  kind: ReminderKind;
  template: string;
  dueAt: ISODateTime;
  status: ReminderStatus;
  channel: ChannelKind;
}

/* -------------------------------- 行政文件 -------------------------------- */

export type DocumentKind = "insurance_form" | "referral" | "receipt" | "invoice";
export type DocumentStatus = "draft" | "needs_fields" | "anomaly" | "ready" | "sent";

export interface DocumentCase {
  id: ID;
  clinicId: ID;
  patientId: ID;
  kind: DocumentKind;
  title: string;
  status: DocumentStatus;
  missingFields: string[];
  anomalies: string[];
  amountHKD?: number;
  updatedAt: ISODateTime;
}

/* -------------------------------- 审计日志 -------------------------------- */

export type ActorRef =
  | { type: "staff"; id: ID; name: string }
  | { type: "agent"; id: ID; name: string }
  | { type: "system"; id: ID; name: string };

export interface AuditEvent {
  id: ID;
  clinicId: ID;
  at: ISODateTime;
  actor: ActorRef;
  action: string;
  target: string;
  result: "success" | "blocked" | "failed";
  detail: string;
}

/* -------------------------------- 会话上下文 ------------------------------ */

export interface Session {
  clinicId: ID;
  staffId: ID;
  deviceBound: boolean;
  method: "code" | "qr" | "passkey";
  at: ISODateTime;
}
