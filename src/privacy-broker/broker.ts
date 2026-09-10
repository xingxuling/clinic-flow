import type {
  DataCapability,
  DisclosureDecision,
  DisclosurePolicy,
  DisclosureRequest,
  JobIdentity,
  PrivateJobData,
  PrivacyAuditEvent,
  PrivacyJobContext,
  PrivacyParty,
  PublicJobView,
} from "@/privacy-broker/types";

interface StoredJob {
  context: PrivacyJobContext;
  privateData: PrivateJobData;
  serviceSummary: string;
  approximateArea?: string;
  schedule?: { serviceStartAt: string; serviceEndAt: string };
  preparation: string[];
}

export const DEFAULT_DISCLOSURE_POLICY: DisclosurePolicy = {
  id: "service-frontdesk.default-disclosure.v1",
  version: "v1",
  retentionDays: {
    jobIdentity: 30,
    conversation: 180,
    exactAddress: 7,
    attachment: 30,
    audit: 365,
  },
  allowedCapabilities: {
    matching: [
      "job.service_summary.read",
      "job.approximate_area.read",
      "job.schedule.read",
      "job.channel_endpoint.use",
    ],
    booking_confirmed: [
      "job.service_summary.read",
      "job.approximate_area.read",
      "job.schedule.read",
      "job.preparation.read",
      "job.channel_endpoint.use",
    ],
    near_service: [
      "job.service_summary.read",
      "job.approximate_area.read",
      "job.schedule.read",
      "job.preparation.read",
      "job.exact_address.read",
      "job.entry_instruction.read",
      "job.channel_endpoint.use",
    ],
    service_execution: [
      "job.service_summary.read",
      "job.approximate_area.read",
      "job.schedule.read",
      "job.preparation.read",
      "job.exact_address.read",
      "job.entry_instruction.read",
      "job.channel_endpoint.use",
    ],
    manual: [
      "job.service_summary.read",
      "job.approximate_area.read",
      "job.schedule.read",
      "job.preparation.read",
      "job.exact_address.read",
      "job.entry_instruction.read",
      "job.channel_endpoint.use",
      "job.private_phone.read",
    ],
  },
  allowDirectPhoneSharing: false,
  requireCustomerConsentForExactAddress: true,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function addDays(at: string, days: number): string {
  return new Date(new Date(at).getTime() + days * 24 * 60 * 60_000).toISOString();
}

function shortAlias(prefix: "Customer" | "Worker", id: string): string {
  const safe = id
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-4)
    .toUpperCase()
    .padStart(4, "0");
  return `${prefix} #${safe}`;
}

function fieldForCapability(capability: DataCapability): string[] {
  switch (capability) {
    case "job.service_summary.read":
      return ["service_summary"];
    case "job.approximate_area.read":
      return ["approximate_area"];
    case "job.schedule.read":
      return ["schedule"];
    case "job.preparation.read":
      return ["preparation"];
    case "job.exact_address.read":
      return ["exact_address"];
    case "job.entry_instruction.read":
      return ["entry_instruction"];
    case "job.channel_endpoint.use":
      return ["channel_endpoint_ref"];
    case "job.private_phone.read":
      return ["private_phone"];
  }
}

function capabilityValue(
  stored: StoredJob,
  capability: DataCapability,
  target: "customer" | "worker",
): string | string[] | null {
  switch (capability) {
    case "job.service_summary.read":
      return stored.serviceSummary;
    case "job.approximate_area.read":
      return stored.approximateArea ?? null;
    case "job.schedule.read":
      return stored.schedule
        ? `${stored.schedule.serviceStartAt}/${stored.schedule.serviceEndAt}`
        : null;
    case "job.preparation.read":
      return [...stored.preparation];
    case "job.exact_address.read":
      return stored.privateData.exactAddress ?? null;
    case "job.entry_instruction.read":
      return stored.privateData.entryInstruction ?? null;
    case "job.channel_endpoint.use":
      return `job-endpoint:${stored.context.jobId}:${target}`;
    case "job.private_phone.read":
      return target === "customer"
        ? (stored.privateData.customerPhone ?? null)
        : (stored.privateData.workerPhone ?? null);
  }
}

function isParticipant(context: PrivacyJobContext, party: PrivacyParty, id: string): boolean {
  if (party === "customer") return id === context.customerId;
  if (party === "worker") return id === context.workerId;
  if (party === "platform_agent") return id === `agent:${context.jobId}`;
  return Boolean(id.trim());
}

function blockedDecision(
  stored: StoredJob,
  request: DisclosureRequest,
  reasonCode: string,
  reason: string,
): DisclosureDecision {
  return {
    allowed: false,
    blockCode: reasonCode,
    reason,
    fields: [],
    value: null,
    auditEvent: {
      eventId: makeId("privacy_audit"),
      tenantId: stored.context.tenantId,
      verticalId: stored.context.verticalId,
      jobId: stored.context.jobId,
      actorType: request.requester,
      actorId: request.requesterId,
      target: request.target,
      capability: request.capability,
      stage: request.stage,
      purpose: request.purpose,
      result: "blocked",
      reasonCode,
      fields: [],
      occurredAt: request.now ?? new Date().toISOString(),
    },
  };
}

/**
 * Job-scoped privacy boundary. Callers receive aliases and purpose-scoped
 * values; the stored private data has no public getter and is never part of a
 * scheduling or agent context by default.
 */
export class PrivacyBroker {
  private readonly jobs = new Map<string, StoredJob>();
  private readonly auditEvents: PrivacyAuditEvent[] = [];

  createJobContext(input: {
    jobId: string;
    tenantId: string;
    verticalId: string;
    customerId: string;
    workerId: string;
    serviceSummary: string;
    approximateArea?: string;
    schedule?: { serviceStartAt: string; serviceEndAt: string };
    preparation?: string[];
    sensitiveData?: PrivateJobData;
    policy?: DisclosurePolicy;
    now?: string;
  }): PrivacyJobContext {
    const now = input.now ?? new Date().toISOString();
    const policy = clone(input.policy ?? DEFAULT_DISCLOSURE_POLICY);
    const existing = this.jobs.get(input.jobId);
    if (existing) {
      if (
        existing.context.tenantId !== input.tenantId ||
        existing.context.verticalId !== input.verticalId ||
        existing.context.customerId !== input.customerId ||
        existing.context.workerId !== input.workerId
      ) {
        throw new Error("PRIVACY_JOB_SCOPE_CONFLICT");
      }
      return clone(existing.context);
    }
    const context: PrivacyJobContext = {
      jobId: input.jobId,
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      customerId: input.customerId,
      workerId: input.workerId,
      customerIdentity: {
        jobId: input.jobId,
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        party: "customer",
        alias: shortAlias("Customer", input.customerId),
        createdAt: now,
        expiresAt: addDays(now, policy.retentionDays.jobIdentity),
        status: "active",
      },
      workerIdentity: {
        jobId: input.jobId,
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        party: "worker",
        alias: shortAlias("Worker", input.workerId),
        createdAt: now,
        expiresAt: addDays(now, policy.retentionDays.jobIdentity),
        status: "active",
      },
      policy,
      createdAt: now,
      expiresAt: addDays(now, policy.retentionDays.jobIdentity),
    };
    const stored: StoredJob = {
      context,
      privateData: clone(input.sensitiveData ?? {}),
      serviceSummary: input.serviceSummary,
      ...(input.approximateArea ? { approximateArea: input.approximateArea } : {}),
      ...(input.schedule ? { schedule: clone(input.schedule) } : {}),
      preparation: [...(input.preparation ?? [])],
    };
    this.jobs.set(input.jobId, stored);
    return clone(context);
  }

  getContext(input: {
    jobId: string;
    tenantId: string;
    verticalId: string;
    now?: string;
  }): PrivacyJobContext | null {
    const stored = this.jobs.get(input.jobId);
    if (!stored) return null;
    if (
      stored.context.tenantId !== input.tenantId ||
      stored.context.verticalId !== input.verticalId
    ) {
      return null;
    }
    const now = new Date(input.now ?? new Date().toISOString());
    if (now >= new Date(stored.context.expiresAt)) return null;
    return clone(stored.context);
  }

  viewForParty(input: {
    jobId: string;
    tenantId: string;
    verticalId: string;
    party: "customer" | "worker";
    partyId: string;
    serviceSummary: string;
    approximateArea?: string;
    schedule?: { serviceStartAt: string; serviceEndAt: string };
    now?: string;
  }): PublicJobView | null {
    const context = this.getContext(input);
    if (!context) return null;
    if (!isParticipant(context, input.party, input.partyId)) return null;
    const stored = this.jobs.get(input.jobId);
    if (!stored) return null;
    return {
      jobId: context.jobId,
      tenantId: context.tenantId,
      verticalId: context.verticalId,
      party: input.party,
      customerAlias: context.customerIdentity.alias,
      workerAlias: context.workerIdentity.alias,
      serviceSummary: stored.serviceSummary,
      ...(stored.approximateArea ? { approximateArea: stored.approximateArea } : {}),
      ...(stored.schedule ? { schedule: clone(stored.schedule) } : {}),
    };
  }

  requestDisclosure(request: DisclosureRequest): DisclosureDecision {
    const stored = this.jobs.get(request.jobId);
    if (!stored) {
      const missing: PrivacyAuditEvent = {
        eventId: makeId("privacy_audit"),
        tenantId: request.tenantId,
        verticalId: request.verticalId,
        jobId: request.jobId,
        actorType: request.requester,
        actorId: request.requesterId,
        target: request.target,
        capability: request.capability,
        stage: request.stage,
        purpose: request.purpose,
        result: "blocked",
        reasonCode: "JOB_NOT_FOUND",
        fields: [],
        occurredAt: request.now ?? new Date().toISOString(),
      };
      this.auditEvents.push(missing);
      return {
        allowed: false,
        blockCode: "JOB_NOT_FOUND",
        reason: "The job context does not exist.",
        fields: [],
        value: null,
        auditEvent: clone(missing),
      };
    }
    if (
      stored.context.tenantId !== request.tenantId ||
      stored.context.verticalId !== request.verticalId
    ) {
      const decision = blockedDecision(
        stored,
        request,
        "TENANT_OR_VERTICAL_MISMATCH",
        "The job scope does not match.",
      );
      this.auditEvents.push(decision.auditEvent);
      return decision;
    }
    if (!isParticipant(stored.context, request.requester, request.requesterId)) {
      const decision = blockedDecision(
        stored,
        request,
        "PARTICIPANT_SCOPE_REQUIRED",
        "The requester is not a participant in this job.",
      );
      this.auditEvents.push(decision.auditEvent);
      return decision;
    }
    if (request.capability === "job.private_phone.read") {
      const allowed =
        stored.context.policy.allowDirectPhoneSharing &&
        request.requester === "human" &&
        request.customerConsented === true &&
        request.purpose === "support";
      if (!allowed) {
        const decision = blockedDecision(
          stored,
          request,
          "PRIVATE_PHONE_DISCLOSURE_FORBIDDEN",
          "Private phone numbers remain hidden unless a human policy explicitly allows purpose-bound disclosure with consent.",
        );
        this.auditEvents.push(decision.auditEvent);
        return decision;
      }
    }
    if (
      request.capability === "job.channel_endpoint.use" &&
      !["platform_agent", "human"].includes(request.requester)
    ) {
      const decision = blockedDecision(
        stored,
        request,
        "CHANNEL_ENDPOINT_REQUIRES_PLATFORM",
        "Participants cannot retrieve each other's private channel endpoint.",
      );
      this.auditEvents.push(decision.auditEvent);
      return decision;
    }
    if (
      request.capability === "job.exact_address.read" &&
      (request.target !== "worker" ||
        (request.requester !== "worker" && request.requester !== "human") ||
        request.purpose !== "service_execution" ||
        !["near_service", "service_execution"].includes(request.stage))
    ) {
      const decision = blockedDecision(
        stored,
        request,
        "EXACT_ADDRESS_PURPOSE_REQUIRED",
        "Exact address is only available to the worker near service time for service execution.",
      );
      this.auditEvents.push(decision.auditEvent);
      return decision;
    }
    if (
      request.capability === "job.entry_instruction.read" &&
      (request.target !== "worker" ||
        (request.requester !== "worker" && request.requester !== "human") ||
        request.purpose !== "service_execution" ||
        !["near_service", "service_execution"].includes(request.stage))
    ) {
      const decision = blockedDecision(
        stored,
        request,
        "ENTRY_INSTRUCTION_PURPOSE_REQUIRED",
        "Entry instructions are only available to the worker near or during service execution.",
      );
      this.auditEvents.push(decision.auditEvent);
      return decision;
    }
    if (
      request.capability === "job.exact_address.read" &&
      stored.context.policy.requireCustomerConsentForExactAddress &&
      request.customerConsented !== true
    ) {
      const decision = blockedDecision(
        stored,
        request,
        "CUSTOMER_CONSENT_REQUIRED",
        "Customer consent is required before exact address disclosure.",
      );
      this.auditEvents.push(decision.auditEvent);
      return decision;
    }

    const allowedCapabilities = stored.context.policy.allowedCapabilities[request.stage] ?? [];
    if (!allowedCapabilities.includes(request.capability)) {
      const decision = blockedDecision(
        stored,
        request,
        "DISCLOSURE_STAGE_NOT_ALLOWED",
        `The capability is not available during the ${request.stage} stage.`,
      );
      this.auditEvents.push(decision.auditEvent);
      return decision;
    }

    const fields = fieldForCapability(request.capability);
    const event: PrivacyAuditEvent = {
      eventId: makeId("privacy_audit"),
      tenantId: stored.context.tenantId,
      verticalId: stored.context.verticalId,
      jobId: stored.context.jobId,
      actorType: request.requester,
      actorId: request.requesterId,
      target: request.target,
      capability: request.capability,
      stage: request.stage,
      purpose: request.purpose,
      result: "allowed",
      reasonCode: "POLICY_ALLOWED",
      fields,
      occurredAt: request.now ?? new Date().toISOString(),
    };
    this.auditEvents.push(event);
    return {
      allowed: true,
      blockCode: null,
      reason: "Purpose-bound disclosure allowed.",
      fields,
      value: capabilityValue(stored, request.capability, request.target),
      auditEvent: clone(event),
    };
  }

  listAuditEvents(input: {
    tenantId: string;
    verticalId: string;
    jobId?: string;
  }): PrivacyAuditEvent[] {
    return clone(
      this.auditEvents.filter(
        (event) =>
          event.tenantId === input.tenantId &&
          event.verticalId === input.verticalId &&
          (!input.jobId || event.jobId === input.jobId),
      ),
    );
  }

  purge(now = new Date().toISOString()): { jobs: number; auditEvents: number } {
    const cutoff = new Date(now).getTime();
    let jobs = 0;
    for (const [jobId, stored] of this.jobs.entries()) {
      const createdAt = new Date(stored.context.createdAt).getTime();
      const exactDataCutoff =
        createdAt + stored.context.policy.retentionDays.exactAddress * 24 * 60 * 60_000;
      if (exactDataCutoff <= cutoff) {
        delete stored.privateData.exactAddress;
        delete stored.privateData.entryInstruction;
      }
      if (new Date(stored.context.expiresAt).getTime() <= cutoff) {
        this.jobs.delete(jobId);
        jobs += 1;
      }
    }
    const before = this.auditEvents.length;
    const retained = this.auditEvents.filter((event) => {
      const stored = this.jobs.get(event.jobId);
      const retentionDays =
        stored?.context.policy.retentionDays.audit ?? DEFAULT_DISCLOSURE_POLICY.retentionDays.audit;
      return new Date(event.occurredAt).getTime() + retentionDays * 24 * 60 * 60_000 > cutoff;
    });
    this.auditEvents.splice(0, this.auditEvents.length, ...retained);
    return { jobs, auditEvents: before - retained.length };
  }
}
