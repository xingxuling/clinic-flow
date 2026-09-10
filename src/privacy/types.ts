export type PrivacyStage = "matching" | "confirmed" | "near_service" | "completed";
export type PrivacyViewer = "customer" | "worker" | "staff" | "customer_agent" | "worker_agent";

export const PRIVACY_STAGE_ORDER: Record<PrivacyStage, number> = {
  matching: 0,
  confirmed: 1,
  near_service: 2,
  completed: 3,
};

export type DataCapability =
  | "job.identity"
  | "job.service"
  | "job.time"
  | "job.duration"
  | "job.requirements"
  | "job.approximate_area"
  | "job.area_detail"
  | "job.exact_address"
  | "customer.phone"
  | "customer.email"
  | "worker.phone"
  | "worker.email";

export interface DisclosurePolicy {
  policyId: string;
  version: string;
  allowedCapabilities: Record<PrivacyStage, DataCapability[]>;
  allowExactAddressNearService: boolean;
  allowPhoneDisclosure: boolean;
  retentionDays: {
    jobIdentity: number;
    exactAddress: number;
    conversation: number;
  };
}

export const DEFAULT_DISCLOSURE_POLICY: DisclosurePolicy = {
  policyId: "service-frontdesk.default-disclosure",
  version: "v1",
  allowedCapabilities: {
    matching: [
      "job.identity",
      "job.service",
      "job.time",
      "job.duration",
      "job.requirements",
      "job.approximate_area",
    ],
    confirmed: [
      "job.identity",
      "job.service",
      "job.time",
      "job.duration",
      "job.requirements",
      "job.approximate_area",
    ],
    near_service: [
      "job.identity",
      "job.service",
      "job.time",
      "job.duration",
      "job.requirements",
      "job.approximate_area",
      "job.exact_address",
    ],
    completed: ["job.identity", "job.service", "job.time", "job.duration"],
  },
  allowExactAddressNearService: true,
  allowPhoneDisclosure: false,
  retentionDays: {
    jobIdentity: 30,
    exactAddress: 7,
    conversation: 90,
  },
};

export interface PrivacyContext {
  contextId: string;
  tenantId: string;
  verticalId: string;
  jobId: string;
  customerId: string;
  workerId: string;
  customerPublicId: string;
  workerPublicId: string;
  customerDisplayName: string;
  workerDisplayName: string;
  serviceType: string;
  approximateAreaLabel: string;
  startAt: string;
  endAt: string;
  durationMin: number;
  requirements: string[];
  stage: PrivacyStage;
  policy: DisclosurePolicy;
  createdAt: string;
  expiresAt: string;
}

export interface PrivacyConsentRecord {
  consentId: string;
  tenantId: string;
  verticalId: string;
  contextId: string;
  jobId: string;
  customerId: string;
  capability: "job.exact_address";
  purpose: string;
  grantedAt: string;
}

export interface PrivacyAuditEvent {
  eventId: string;
  tenantId: string;
  verticalId: string;
  contextId: string;
  jobId: string;
  requestedBy: PrivacyViewer;
  capability: DataCapability;
  purpose: string;
  decision: "allowed" | "blocked";
  disclosedFields: string[];
  consented: boolean;
  at: string;
}

export interface PrivacyView {
  contextId: string;
  jobId: string;
  viewer: PrivacyViewer;
  stage: PrivacyStage;
  publicIdentity: string;
  serviceType?: string;
  startAt?: string;
  endAt?: string;
  durationMin?: number;
  approximateArea?: string;
  exactAddress?: string;
  requirements?: string[];
  disclosedCapabilities: DataCapability[];
}

export interface PrivacyAccessDecision {
  allowed: boolean;
  code:
    | "ALLOWED"
    | "CONTEXT_NOT_FOUND"
    | "TENANT_MISMATCH"
    | "VERTICAL_MISMATCH"
    | "STAGE_MISMATCH"
    | "VIEWER_NOT_PARTICIPANT"
    | "CAPABILITY_NOT_ALLOWED"
    | "CONSENT_REQUIRED"
    | "PURPOSE_REQUIRED"
    | "DATA_NOT_AVAILABLE";
  reason: string;
  value?: string;
  auditEvent: PrivacyAuditEvent;
}

export interface PrivacyRepository {
  getContext(tenantId: string, contextId: string): PrivacyContext | null;
  saveContext(context: PrivacyContext): void;
  updateContext(
    tenantId: string,
    contextId: string,
    patch: Partial<PrivacyContext>,
  ): PrivacyContext | null;
  getConsent(
    tenantId: string,
    verticalId: string,
    contextId: string,
    capability: PrivacyConsentRecord["capability"],
    purpose: string,
  ): PrivacyConsentRecord | null;
  saveConsent(consent: PrivacyConsentRecord): void;
  appendAudit(event: PrivacyAuditEvent): void;
  listAudit(tenantId: string, verticalId: string, contextId?: string): PrivacyAuditEvent[];
}

export interface PrivateDataVault {
  read(
    contextId: string,
    field: "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email",
  ): string | null;
  write(
    contextId: string,
    field: "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email",
    value: string,
  ): void;
  remove(
    contextId: string,
    field: "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email",
  ): void;
}

export class EmptyPrivateDataVault implements PrivateDataVault {
  read(): string | null {
    return null;
  }

  write(): void {}

  remove(): void {}
}

export class InMemoryPrivateDataVault implements PrivateDataVault {
  private readonly values = new Map<string, string>();

  set(
    contextId: string,
    field: "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email",
    value: string,
  ): void {
    this.values.set(`${contextId}:${field}`, value);
  }

  write(
    contextId: string,
    field: "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email",
    value: string,
  ): void {
    this.set(contextId, field, value);
  }

  remove(
    contextId: string,
    field: "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email",
  ): void {
    this.values.delete(`${contextId}:${field}`);
  }

  read(
    contextId: string,
    field: "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email",
  ): string | null {
    return this.values.get(`${contextId}:${field}`) ?? null;
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.values.entries());
  }
}

export class InMemoryPrivacyRepository implements PrivacyRepository {
  private contexts: PrivacyContext[] = [];
  private consents: PrivacyConsentRecord[] = [];
  private auditEvents: PrivacyAuditEvent[] = [];

  getContext(tenantId: string, contextId: string): PrivacyContext | null {
    return (
      this.contexts.find(
        (context) => context.tenantId === tenantId && context.contextId === contextId,
      ) ?? null
    );
  }

  saveContext(context: PrivacyContext): void {
    this.contexts.push(structuredClone(context));
  }

  updateContext(
    tenantId: string,
    contextId: string,
    patch: Partial<PrivacyContext>,
  ): PrivacyContext | null {
    const index = this.contexts.findIndex(
      (context) => context.tenantId === tenantId && context.contextId === contextId,
    );
    if (index < 0) return null;
    this.contexts[index] = { ...this.contexts[index]!, ...structuredClone(patch) };
    return structuredClone(this.contexts[index]!);
  }

  getConsent(
    tenantId: string,
    verticalId: string,
    contextId: string,
    capability: PrivacyConsentRecord["capability"],
    purpose: string,
  ): PrivacyConsentRecord | null {
    const consent = this.consents.find(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.contextId === contextId &&
        item.capability === capability &&
        item.purpose === purpose,
    );
    return consent ? structuredClone(consent) : null;
  }

  saveConsent(consent: PrivacyConsentRecord): void {
    const index = this.consents.findIndex(
      (item) =>
        item.consentId === consent.consentId &&
        item.tenantId === consent.tenantId &&
        item.verticalId === consent.verticalId,
    );
    if (index < 0) this.consents.push(structuredClone(consent));
    else this.consents[index] = structuredClone(consent);
  }

  appendAudit(event: PrivacyAuditEvent): void {
    this.auditEvents.push(structuredClone(event));
  }

  listAudit(tenantId: string, verticalId: string, contextId?: string): PrivacyAuditEvent[] {
    return this.auditEvents
      .filter(
        (event) =>
          event.tenantId === tenantId &&
          event.verticalId === verticalId &&
          (!contextId || event.contextId === contextId),
      )
      .map((event) => structuredClone(event));
  }

  snapshot(): {
    contexts: PrivacyContext[];
    consents: PrivacyConsentRecord[];
    auditEvents: PrivacyAuditEvent[];
  } {
    return {
      contexts: structuredClone(this.contexts),
      consents: structuredClone(this.consents),
      auditEvents: structuredClone(this.auditEvents),
    };
  }

  restore(snapshot: {
    contexts: PrivacyContext[];
    consents: PrivacyConsentRecord[];
    auditEvents: PrivacyAuditEvent[];
  }): void {
    this.contexts = structuredClone(snapshot.contexts);
    this.consents = structuredClone(snapshot.consents);
    this.auditEvents = structuredClone(snapshot.auditEvents);
  }
}
