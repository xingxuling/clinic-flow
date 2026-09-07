import type { RiskLevel } from "@/types/domain";

export type ServiceWorkItemKind =
  | "follow_up_message"
  | "booking_change"
  | "admin_review"
  | "integration_sync";

export type ServiceWorkItemStatus =
  | "waiting_approval"
  | "ready_to_send"
  | "done"
  | "rejected";

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
  sourceRef?: string;
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
  sourceRef?: string;
}
