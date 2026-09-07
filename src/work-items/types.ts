import type { RiskLevel } from "@/types/domain";

export type ServiceWorkItemKind =
  | "follow_up_message"
  | "booking_reminder"
  | "booking_change"
  | "admin_review"
  | "integration_sync";

export type ServiceWorkItemStatus =
  | "waiting_approval"
  | "ready_to_send"
  | "done"
  | "rejected";

export interface ServiceWorkItemReplyOption {
  id: string;
  label: string;
  payload: string;
}

export interface ServiceWorkItemDispatchReceipt {
  providerId: string;
  sentAt: string;
  providerMessageId?: string;
}

export interface ServiceWorkItem {
  id: string;
  tenantId: string;
  verticalId: string;
  kind: ServiceWorkItemKind;
  customerId?: string;
  subjectId?: string;
  title: string;
  intent: string;
  basis: string[];
  effects: string[];
  risk: RiskLevel;
  status: ServiceWorkItemStatus;
  proposedMessage?: string;
  proposedReplyOptions?: ServiceWorkItemReplyOption[];
  sourceRef?: string;
  dispatchReceipt?: ServiceWorkItemDispatchReceipt;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface NewServiceWorkItemInput {
  tenantId: string;
  verticalId: string;
  kind: ServiceWorkItemKind;
  customerId?: string;
  subjectId?: string;
  title: string;
  intent: string;
  basis: string[];
  effects: string[];
  risk: RiskLevel;
  proposedMessage?: string;
  proposedReplyOptions?: ServiceWorkItemReplyOption[];
  sourceRef?: string;
}
