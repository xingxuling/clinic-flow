export type PrivacyParty = "customer" | "worker" | "platform_agent" | "human";
export type PrivacyStage =
  "matching" | "booking_confirmed" | "near_service" | "service_execution" | "manual" | "closed";

export type DataCapability =
  | "job.service_summary.read"
  | "job.approximate_area.read"
  | "job.schedule.read"
  | "job.preparation.read"
  | "job.exact_address.read"
  | "job.entry_instruction.read"
  | "job.channel_endpoint.use"
  | "job.private_phone.read";

export interface DisclosurePolicy {
  id: string;
  version: string;
  retentionDays: {
    jobIdentity: number;
    conversation: number;
    exactAddress: number;
    attachment: number;
    audit: number;
  };
  allowedCapabilities: Partial<Record<PrivacyStage, DataCapability[]>>;
  allowDirectPhoneSharing: boolean;
  requireCustomerConsentForExactAddress: boolean;
}

export interface JobIdentity {
  jobId: string;
  tenantId: string;
  verticalId: string;
  party: "customer" | "worker";
  alias: string;
  createdAt: string;
  expiresAt: string;
  status: "active" | "expired";
}

/**
 * Sensitive values stay behind PrivacyBroker. Public job views only contain
 * the minimum context needed by the current party or Agent.
 */
export interface PrivateJobData {
  customerPhone?: string;
  customerEmail?: string;
  workerPhone?: string;
  workerEmail?: string;
  exactAddress?: string;
  entryInstruction?: string;
}

export interface PrivacyJobContext {
  jobId: string;
  tenantId: string;
  verticalId: string;
  customerId: string;
  workerId: string;
  customerIdentity: JobIdentity;
  workerIdentity: JobIdentity;
  policy: DisclosurePolicy;
  createdAt: string;
  expiresAt: string;
}

export interface PublicJobView {
  jobId: string;
  tenantId: string;
  verticalId: string;
  party: "customer" | "worker";
  customerAlias: string;
  workerAlias: string;
  serviceSummary: string;
  approximateArea?: string;
  schedule?: { serviceStartAt: string; serviceEndAt: string };
  preparation?: string[];
  exactAddress?: string;
  entryInstruction?: string;
  channelEndpointRef?: string;
}

export interface DisclosureRequest {
  jobId: string;
  tenantId: string;
  verticalId: string;
  requester: PrivacyParty;
  requesterId: string;
  target: "customer" | "worker";
  capability: DataCapability;
  stage: PrivacyStage;
  purpose: "matching" | "service_execution" | "communication" | "support";
  customerConsented?: boolean;
  now?: string;
}

export interface PrivacyAuditEvent {
  eventId: string;
  tenantId: string;
  verticalId: string;
  jobId: string;
  actorType: PrivacyParty;
  actorId: string;
  target: "customer" | "worker" | "platform";
  capability: DataCapability;
  stage: PrivacyStage;
  purpose: DisclosureRequest["purpose"];
  result: "allowed" | "blocked";
  reasonCode: string;
  fields: string[];
  occurredAt: string;
}

export interface DisclosureDecision {
  allowed: boolean;
  blockCode: string | null;
  reason: string;
  fields: string[];
  value: string | string[] | null;
  auditEvent: PrivacyAuditEvent;
}
