import {
  DEFAULT_DISCLOSURE_POLICY,
  EmptyPrivateDataVault,
  type DataCapability,
  type DisclosurePolicy,
  type PrivateDataVault,
  type PrivacyAccessDecision,
  type PrivacyAuditEvent,
  type PrivacyContext,
  type PrivacyConsentRecord,
  type PrivacyRepository,
  type PrivacyStage,
  type PrivacyView,
  type PrivacyViewer,
  PRIVACY_STAGE_ORDER,
} from "@/privacy/types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function publicId(prefix: "Customer" | "Worker", jobId: string): string {
  const compact = jobId
    .replace(/[^a-z0-9]/gi, "")
    .slice(-4)
    .toUpperCase()
    .padStart(4, "0");
  return `${prefix} #${compact}`;
}

function policyClone(policy?: DisclosurePolicy): DisclosurePolicy {
  const source = policy ?? DEFAULT_DISCLOSURE_POLICY;
  return {
    ...source,
    allowedCapabilities: Object.fromEntries(
      Object.entries(source.allowedCapabilities).map(([stage, capabilities]) => [
        stage,
        [...capabilities],
      ]),
    ) as Record<PrivacyStage, DataCapability[]>,
    retentionDays: { ...source.retentionDays },
  };
}

function hasParticipant(
  context: PrivacyContext,
  viewer: PrivacyViewer,
  viewerSubjectId?: string,
): boolean {
  if (viewer === "customer" || viewer === "customer_agent")
    return viewerSubjectId === context.customerId;
  if (viewer === "worker" || viewer === "worker_agent") return viewerSubjectId === context.workerId;
  return viewer === "staff";
}

function capabilityField(
  capability: DataCapability,
): "exact_address" | "customer_phone" | "customer_email" | "worker_phone" | "worker_email" | null {
  switch (capability) {
    case "job.exact_address":
      return "exact_address";
    case "customer.phone":
      return "customer_phone";
    case "customer.email":
      return "customer_email";
    case "worker.phone":
      return "worker_phone";
    case "worker.email":
      return "worker_email";
    default:
      return null;
  }
}

export class PrivacyBroker {
  constructor(
    private readonly repository: PrivacyRepository,
    private readonly vault: PrivateDataVault = new EmptyPrivateDataVault(),
  ) {}

  createContext(input: {
    tenantId: string;
    verticalId: string;
    jobId: string;
    customerId: string;
    workerId: string;
    customerDisplayName: string;
    workerDisplayName: string;
    serviceType: string;
    approximateAreaLabel: string;
    areaDetail?: string;
    startAt: string;
    endAt: string;
    requirements: string[];
    policy?: DisclosurePolicy;
    now?: Date;
  }): PrivacyContext {
    const now = input.now ?? new Date();
    const policy = policyClone(input.policy);
    const context: PrivacyContext = {
      contextId: makeId("privacy"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      jobId: input.jobId,
      customerId: input.customerId,
      workerId: input.workerId,
      customerPublicId: publicId("Customer", input.jobId),
      workerPublicId: publicId("Worker", input.jobId),
      customerDisplayName: input.customerDisplayName,
      workerDisplayName: input.workerDisplayName,
      serviceType: input.serviceType,
      approximateAreaLabel: input.approximateAreaLabel,
      startAt: input.startAt,
      endAt: input.endAt,
      durationMin: Math.max(
        1,
        Math.round((new Date(input.endAt).getTime() - new Date(input.startAt).getTime()) / 60_000),
      ),
      requirements: [...input.requirements],
      stage: "confirmed",
      policy,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + policy.retentionDays.jobIdentity * 86_400_000,
      ).toISOString(),
    };
    let privateDataWritten = false;
    try {
      if (input.areaDetail) {
        this.vault.write(context.contextId, "exact_address", input.areaDetail);
        privateDataWritten = true;
      }
      this.repository.saveContext(context);
    } catch (error) {
      if (privateDataWritten) this.vault.remove(context.contextId, "exact_address");
      throw error;
    }
    return clone(context);
  }

  clearPrivateContextData(contextId: string): void {
    this.vault.remove(contextId, "exact_address");
  }

  recordCustomerConsent(input: {
    tenantId: string;
    verticalId: string;
    contextId: string;
    customerId: string;
    actorSubjectId: string;
    capability: "job.exact_address";
    purpose: string;
    now?: Date;
  }): PrivacyConsentRecord | null {
    const now = input.now ?? new Date();
    const context = this.repository.getContext(input.tenantId, input.contextId);
    if (
      !context ||
      context.verticalId !== input.verticalId ||
      context.customerId !== input.customerId ||
      input.actorSubjectId !== input.customerId ||
      new Date(context.expiresAt) <= now ||
      !input.purpose.trim()
    )
      return null;
    const consent: PrivacyConsentRecord = {
      consentId: makeId("privacy_consent"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      contextId: input.contextId,
      jobId: context.jobId,
      customerId: context.customerId,
      capability: input.capability,
      purpose: input.purpose.trim(),
      grantedAt: now.toISOString(),
    };
    this.repository.saveConsent(consent);
    this.repository.appendAudit({
      eventId: makeId("privacy_audit"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      contextId: input.contextId,
      jobId: context.jobId,
      requestedBy: "customer",
      capability: input.capability,
      purpose: input.purpose.trim(),
      decision: "allowed",
      disclosedFields: [],
      consented: true,
      at: now.toISOString(),
    });
    return clone(consent);
  }

  setStage(input: {
    tenantId: string;
    verticalId: string;
    contextId: string;
    stage: PrivacyStage;
    now?: Date;
  }): PrivacyContext | null {
    const context = this.repository.getContext(input.tenantId, input.contextId);
    if (!context || context.verticalId !== input.verticalId) return null;
    if (new Date(context.expiresAt) <= (input.now ?? new Date())) return null;
    if (PRIVACY_STAGE_ORDER[input.stage] < PRIVACY_STAGE_ORDER[context.stage]) return null;
    return this.repository.updateContext(input.tenantId, input.contextId, { stage: input.stage });
  }

  requestAccess(input: {
    tenantId: string;
    verticalId: string;
    contextId: string;
    viewer: PrivacyViewer;
    viewerSubjectId?: string;
    capability: DataCapability;
    purpose: string;
    consented?: boolean;
    stage?: PrivacyStage;
    now?: Date;
  }): PrivacyAccessDecision {
    const now = input.now ?? new Date();
    const context = this.repository.getContext(input.tenantId, input.contextId);
    const base = {
      eventId: makeId("privacy_audit"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      contextId: input.contextId,
      jobId: context?.jobId ?? "unknown",
      requestedBy: input.viewer,
      capability: input.capability,
      purpose: input.purpose,
      decision: "blocked" as const,
      disclosedFields: [] as string[],
      consented: Boolean(input.consented),
      at: now.toISOString(),
    } satisfies PrivacyAuditEvent;
    if (!context) return this.block(base, "CONTEXT_NOT_FOUND", "privacy context was not found");
    if (context.verticalId !== input.verticalId)
      return this.block(base, "VERTICAL_MISMATCH", "privacy context belongs to another vertical");
    if (input.stage && input.stage !== context.stage)
      return this.block(
        base,
        "STAGE_MISMATCH",
        "privacy stage is controlled by the context lifecycle",
      );
    if (!input.purpose.trim())
      return this.block(base, "PURPOSE_REQUIRED", "a non-empty disclosure purpose is required");
    if (!hasParticipant(context, input.viewer, input.viewerSubjectId))
      return this.block(
        base,
        "VIEWER_NOT_PARTICIPANT",
        "viewer is not the authorized participant in this job",
      );
    if (new Date(context.expiresAt) <= now)
      return this.block(base, "CONTEXT_NOT_FOUND", "temporary job identity has expired");

    const stage = context.stage;
    const field = capabilityField(input.capability);
    if (
      field &&
      (field === "customer_phone" ||
        field === "worker_phone" ||
        field === "customer_email" ||
        field === "worker_email")
    ) {
      if (!context.policy.allowPhoneDisclosure)
        return this.block(
          base,
          "CAPABILITY_NOT_ALLOWED",
          "private contact details are not disclosed by the default policy",
        );
      if (!input.consented)
        return this.block(
          base,
          "CONSENT_REQUIRED",
          "explicit consent is required for private contact disclosure",
        );
    }
    if (!(context.policy.allowedCapabilities[stage] ?? []).includes(input.capability)) {
      return this.block(
        base,
        "CAPABILITY_NOT_ALLOWED",
        `capability is not allowed at ${stage} stage`,
      );
    }
    if (input.capability === "job.exact_address") {
      if (stage !== "near_service" || !context.policy.allowExactAddressNearService)
        return this.block(
          base,
          "CAPABILITY_NOT_ALLOWED",
          "exact address is only available near service time under tenant policy",
        );
      if (input.purpose !== "active_service_delivery")
        return this.block(
          base,
          "PURPOSE_REQUIRED",
          "exact address is bound to active service delivery",
        );
      const consent = this.repository.getConsent(
        input.tenantId,
        input.verticalId,
        context.contextId,
        input.capability,
        input.purpose,
      );
      if (!consent)
        return this.block(
          base,
          "CONSENT_REQUIRED",
          "customer consent record is required before exact address disclosure",
        );
    }
    if (field) {
      const value = this.vault.read(context.contextId, field);
      if (!value)
        return this.block(
          base,
          "DATA_NOT_AVAILABLE",
          "authorized data is not available in the private vault",
        );
      const event = {
        ...base,
        decision: "allowed" as const,
        disclosedFields: [field],
        consented: input.capability === "job.exact_address" ? true : base.consented,
      } satisfies PrivacyAuditEvent;
      this.repository.appendAudit(event);
      return {
        allowed: true,
        code: "ALLOWED",
        reason: "capability and purpose policy passed",
        value,
        auditEvent: clone(event),
      };
    }
    const event = {
      ...base,
      decision: "allowed" as const,
      disclosedFields: [input.capability],
    } satisfies PrivacyAuditEvent;
    this.repository.appendAudit(event);
    return {
      allowed: true,
      code: "ALLOWED",
      reason: "capability and purpose policy passed",
      auditEvent: clone(event),
    };
  }

  getScopedView(input: {
    tenantId: string;
    verticalId: string;
    contextId: string;
    viewer: PrivacyViewer;
    viewerSubjectId?: string;
    stage?: PrivacyStage;
    consented?: boolean;
    purpose?: string;
    now?: Date;
  }): PrivacyView | null {
    const context = this.repository.getContext(input.tenantId, input.contextId);
    if (
      !context ||
      context.verticalId !== input.verticalId ||
      !hasParticipant(context, input.viewer, input.viewerSubjectId) ||
      (input.stage !== undefined && input.stage !== context.stage)
    )
      return null;
    const stage = context.stage;
    const purpose = input.purpose ?? "job_operations";
    const capabilities: DataCapability[] = [
      "job.identity",
      "job.service",
      "job.time",
      "job.duration",
      "job.requirements",
      "job.approximate_area",
    ];
    const disclosed = capabilities.filter(
      (capability) => this.requestAccess({ ...input, capability, stage, purpose }).allowed,
    );
    const isCustomer = input.viewer === "customer" || input.viewer === "customer_agent";
    const identity = isCustomer ? context.workerPublicId : context.customerPublicId;
    const view: PrivacyView = {
      contextId: context.contextId,
      jobId: context.jobId,
      viewer: input.viewer,
      stage,
      publicIdentity: identity,
      disclosedCapabilities: [...disclosed],
    };
    if (disclosed.includes("job.service")) view.serviceType = context.serviceType;
    if (disclosed.includes("job.time")) {
      view.startAt = context.startAt;
      view.endAt = context.endAt;
    }
    if (disclosed.includes("job.duration")) view.durationMin = context.durationMin;
    if (disclosed.includes("job.requirements")) view.requirements = [...context.requirements];
    if (disclosed.includes("job.approximate_area"))
      view.approximateArea = context.approximateAreaLabel;
    if (stage === "near_service") {
      const exact = this.requestAccess({
        ...input,
        capability: "job.exact_address",
        stage,
        purpose,
        consented: Boolean(input.consented),
      });
      if (exact.allowed && exact.value) view.exactAddress = exact.value;
    }
    return view;
  }

  private block(
    base: PrivacyAuditEvent,
    code: PrivacyAccessDecision["code"],
    reason: string,
  ): PrivacyAccessDecision {
    this.repository.appendAudit(base);
    return { allowed: false, code, reason, auditEvent: clone(base) };
  }
}
