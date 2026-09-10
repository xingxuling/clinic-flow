import type { FaqCategory, FaqChannel } from "@/frontdesk/faq-engine";

export type ServiceFlowMode = "appointment" | "field_service" | "hybrid";
export type ServiceSubjectKind = "person" | "pet" | "vehicle" | "property" | "none";

export interface VerticalLabels {
  customer: string;
  customers: string;
  subject: string;
  subjects: string;
  resource: string;
  resources: string;
  booking: string;
  bookings: string;
  staff: string;
  venue: string;
}

export interface VerticalSubjectField {
  key: string;
  label: string;
  required: boolean;
  kind: "text" | "number" | "select" | "textarea";
  options?: readonly string[];
  administrativeOnly: true;
}

export interface VerticalServiceScheduling {
  defaultDurationMin: number;
  minDurationMin: number;
  maxDurationMin: number;
  travelBufferMin: number;
  preparationBufferMin: number;
  cleanupBufferMin: number;
}

export interface VerticalServiceDefinition {
  id: string;
  name: string;
  durationMin?: number;
  category: string;
  requiresQuote?: boolean;
  requiresHumanConfirmation?: boolean;
  scheduling?: Partial<VerticalServiceScheduling>;
}

export interface VerticalFollowUpRule {
  id: string;
  label: string;
  trigger: "time_since_service" | "status" | "manual";
  afterDays?: number;
  afterMonths?: number;
  serviceIds?: readonly string[];
  customerMessage: string;
}

export interface VerticalFaqTemplate {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  keywords: readonly string[];
  channels: readonly FaqChannel[];
  enabled: boolean;
  administrativeOnly: true;
}

export interface VerticalIntegrationTarget {
  id: string;
  displayName: string;
  kind: "cms" | "calendar" | "crm" | "booking" | "field_service" | "other";
  status: "candidate" | "verified";
  desiredCapabilities: readonly string[];
  verifiedCapabilities: readonly string[];
  noteZhHk: string;
}

export interface ServiceVerticalPack {
  id: string;
  version: "v0.1";
  displayName: string;
  shortName: string;
  mode: ServiceFlowMode;
  subjectKind: ServiceSubjectKind;
  labels: VerticalLabels;
  subjectFields: readonly VerticalSubjectField[];
  services: readonly VerticalServiceDefinition[];
  faqTemplates: readonly VerticalFaqTemplate[];
  escalationKeywords: readonly string[];
  /**
   * 命中这类问题时，自动 FAQ/自由回答一律关闭并转人工。
   * 行业包只声明边界，不赋予 Agent 专业判断权。
   */
  restrictedQuestionPatterns: readonly RegExp[];
  followUpRules: readonly VerticalFollowUpRule[];
  integrationTargets: readonly VerticalIntegrationTarget[];
  defaultHumanApprovalLeadHours: number;
  scheduling?: {
    holdDurationMin?: number;
    defaultBuffers?: Partial<
      Pick<
        VerticalServiceScheduling,
        "travelBufferMin" | "preparationBufferMin" | "cleanupBufferMin"
      >
    >;
  };
  metadata: {
    candidate: boolean;
    notes: readonly string[];
  };
}

export interface ServiceDomainRef {
  tenantId: string;
  verticalId: string;
  customerId: string;
  subjectId?: string;
}

/**
 * 通用语义层：现有数据库仍可叫 Patient / Appointment，
 * 但核心逻辑只应依赖 Customer / Subject / Service / Resource / Booking 这组概念。
 */
export interface ServiceDomainModel {
  customer: { id: string; displayName: string };
  subject?: { id: string; kind: ServiceSubjectKind; displayName: string };
  service: { id: string; displayName: string };
  resource?: { id: string; displayName: string };
  booking?: { id: string; startAt: string; endAt: string; status: string };
}
