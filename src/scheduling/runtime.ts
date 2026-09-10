import { PrivacyBroker } from "@/privacy/broker";
import type { PrivacyView } from "@/privacy/types";
import { matchServiceRequest } from "@/scheduling/matching";
import { browserSchedulingRepository, type SchedulingRepository } from "@/scheduling/repository";
import type {
  ConfirmationResult,
  JobConversation,
  JobRecord,
  MatchingPolicy,
  MatchingResult,
  NotificationIntent,
  ScheduleHold,
  ScheduledBooking,
  SchedulingAuditEvent,
  ServiceRequest,
  ServiceRequestAttachment,
  ServiceRequestItem,
  SchedulingUrgency,
  Worker,
} from "@/scheduling/types";
import { DEFAULT_MATCHING_POLICY } from "@/scheduling/types";
import { serviceRequestStatusForBookingState, transitionBooking } from "@/scheduling/state-machine";
import { serviceWorkItemRepository } from "@/work-items/repository";
import type { NewServiceWorkItemInput, ServiceWorkItem } from "@/work-items/types";

const locks = new Map<string, Promise<void>>();

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function withProcessLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

async function withSlotLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`service-frontdesk.schedule.${key}`, action);
  }
  return withProcessLock(key, action);
}

export interface WorkItemSink {
  add(input: NewServiceWorkItemInput): ServiceWorkItem;
  findBySource?(tenantId: string, verticalId: string, sourceRef: string): ServiceWorkItem | null;
}

export interface CreateServiceRequestInput {
  tenantId: string;
  verticalId: string;
  customerId: string;
  subjectId?: string;
  serviceType: string;
  serviceItems?: ServiceRequestItem[];
  approximateArea: ServiceRequest["approximateArea"];
  timeZone?: string;
  requestedDate?: string;
  requestedTime?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  estimatedDurationMin?: number;
  urgency?: SchedulingUrgency;
  requirements?: string[];
  attachments?: ServiceRequestAttachment[];
  specialConstraints?: string[];
  privacyLevel?: ServiceRequest["privacyLevel"];
  customerPreference?: ServiceRequest["customerPreference"];
  idempotencyKey?: string;
}

export interface HoldResult {
  ok: boolean;
  code:
    | "OK"
    | "REQUEST_NOT_FOUND"
    | "CANDIDATE_NOT_AVAILABLE"
    | "SLOT_CONFLICT"
    | "TENANT_MISMATCH"
    | "VERTICAL_MISMATCH";
  hold?: ScheduleHold;
}

export interface MarkNotificationResult {
  ok: boolean;
  booking?: ScheduledBooking;
  code: "OK" | "NOT_FOUND" | "TENANT_MISMATCH" | "ALREADY_SENT";
}

export class SmartSchedulingRuntime {
  constructor(
    private readonly repository: SchedulingRepository = browserSchedulingRepository,
    private readonly privacyBroker: PrivacyBroker = new PrivacyBroker(repository),
    private readonly workItems: WorkItemSink = serviceWorkItemRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly idFactory: (prefix: string) => string = makeId,
  ) {}

  createRequest(input: CreateServiceRequestInput): ServiceRequest {
    if (!input.tenantId.trim()) throw new Error("SERVICE_REQUEST_TENANT_REQUIRED");
    if (!input.verticalId.trim()) throw new Error("SERVICE_REQUEST_VERTICAL_REQUIRED");
    if (!input.customerId.trim()) throw new Error("SERVICE_REQUEST_CUSTOMER_REQUIRED");
    if (!input.serviceType.trim()) throw new Error("SERVICE_REQUEST_SERVICE_REQUIRED");
    if (!input.approximateArea.areaId.trim()) throw new Error("SERVICE_REQUEST_AREA_REQUIRED");
    if (input.idempotencyKey) {
      const existing = this.repository
        .listSchedulingAudit(input.tenantId, input.verticalId)
        .find(
          (event) =>
            event.action === "service_request.created" && event.detail === input.idempotencyKey,
        );
      if (existing) {
        const requestId = existing.targetId;
        const request = this.repository.getRequest(input.tenantId, input.verticalId, requestId);
        if (request) return request;
      }
    }
    const timestamp = this.now().toISOString();
    const request: ServiceRequest = {
      requestId: this.idFactory("request"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      customerId: input.customerId,
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      serviceType: input.serviceType.trim(),
      serviceItems: clone(input.serviceItems ?? [{ serviceType: input.serviceType.trim() }]),
      approximateArea: clone(input.approximateArea),
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
      ...(input.requestedDate ? { requestedDate: input.requestedDate } : {}),
      ...(input.requestedTime ? { requestedTime: input.requestedTime } : {}),
      ...(input.timeWindowStart ? { timeWindowStart: input.timeWindowStart } : {}),
      ...(input.timeWindowEnd ? { timeWindowEnd: input.timeWindowEnd } : {}),
      ...(input.estimatedDurationMin === undefined
        ? {}
        : { estimatedDurationMin: input.estimatedDurationMin }),
      urgency: input.urgency ?? "normal",
      requirements: [...(input.requirements ?? [])],
      attachments: clone(input.attachments ?? []),
      specialConstraints: [...(input.specialConstraints ?? [])],
      privacyLevel: input.privacyLevel ?? "standard",
      ...(input.customerPreference ? { customerPreference: clone(input.customerPreference) } : {}),
      status: "draft",
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.repository.saveRequest(request);
    this.audit({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      action: "service_request.created",
      actor: "customer",
      targetId: request.requestId,
      result: "success",
      detail: input.idempotencyKey ?? "",
      at: timestamp,
    });
    return clone(request);
  }

  findCandidates(
    tenantId: string,
    verticalId: string,
    requestId: string,
    policy?: MatchingPolicy,
  ): MatchingResult | null {
    const request = this.repository.getRequest(tenantId, verticalId, requestId);
    if (!request) return null;
    this.releaseExpiredHolds(tenantId, verticalId);
    const matching: ServiceRequest = {
      ...request,
      status: "matching",
      updatedAt: this.now().toISOString(),
    };
    this.repository.saveRequest(matching);
    const result = matchServiceRequest({
      request: matching,
      workers: this.repository.listWorkers(tenantId, verticalId),
      reservations: this.repository.listReservations(tenantId, verticalId),
      policy: policy ?? DEFAULT_MATCHING_POLICY,
      now: this.now(),
    });
    this.repository.saveRequest({
      ...matching,
      status: result.candidates.length ? "offered" : "matching",
      updatedAt: this.now().toISOString(),
    });
    this.audit({
      tenantId,
      verticalId,
      action: "service_request.matched",
      actor: "system",
      targetId: requestId,
      result: "success",
      detail: `${result.candidates.length} candidates`,
      at: this.now().toISOString(),
    });
    return result;
  }

  async holdCandidate(input: {
    tenantId: string;
    verticalId: string;
    requestId: string;
    candidateId: string;
    idempotencyKey: string;
    policy?: MatchingPolicy;
  }): Promise<HoldResult> {
    // Serialize all holds inside a tenant/vertical scope. Candidate IDs include
    // the request ID, so locking only by candidate would leave a race between
    // two different requests asking for the same worker interval.
    const key = `${input.tenantId}:${input.verticalId}`;
    return withSlotLock(key, async () => {
      const request = this.repository.getRequest(input.tenantId, input.verticalId, input.requestId);
      if (!request) return { ok: false, code: "REQUEST_NOT_FOUND" };
      const prior = this.repository
        .listHolds(input.tenantId, input.verticalId)
        .find((hold) => hold.idempotencyKey === input.idempotencyKey);
      if (prior?.status === "active" || prior?.status === "confirmed")
        return { ok: true, code: "OK", hold: prior };
      this.releaseExpiredHolds(input.tenantId, input.verticalId);
      const matching = matchServiceRequest({
        request,
        workers: this.repository.listWorkers(input.tenantId, input.verticalId),
        reservations: this.repository.listReservations(input.tenantId, input.verticalId),
        policy: input.policy ?? DEFAULT_MATCHING_POLICY,
        now: this.now(),
      });
      const candidate = matching.candidates.find((item) => item.candidateId === input.candidateId);
      if (!candidate) return { ok: false, code: "CANDIDATE_NOT_AVAILABLE" };
      const worker = this.repository
        .listWorkers(input.tenantId, input.verticalId)
        .find((item) => item.workerId === candidate.workerId);
      if (!worker) return { ok: false, code: "CANDIDATE_NOT_AVAILABLE" };
      const conflict = this.repository
        .listReservations(input.tenantId, input.verticalId)
        .some(
          (reservation) =>
            reservation.workerId === candidate.workerId &&
            new Date(reservation.occupancyStartAt) < new Date(candidate.occupancyEndAt) &&
            new Date(candidate.occupancyStartAt) < new Date(reservation.occupancyEndAt),
        );
      if (conflict) return { ok: false, code: "SLOT_CONFLICT" };
      const now = this.now();
      const holdId = this.idFactory("hold");
      const hold: ScheduleHold = {
        reservationId: `hold:${holdId}`,
        holdId,
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        workerId: worker.workerId,
        customerId: request.customerId,
        kind: "hold",
        serviceRequestId: request.requestId,
        candidateId: candidate.candidateId,
        startAt: candidate.startAt,
        endAt: candidate.endAt,
        occupancyStartAt: candidate.occupancyStartAt,
        occupancyEndAt: candidate.occupancyEndAt,
        status: "active",
        expiresAt: new Date(
          now.getTime() + (input.policy ?? DEFAULT_MATCHING_POLICY).holdDurationMin * 60_000,
        ).toISOString(),
        idempotencyKey: input.idempotencyKey,
        createdAt: now.toISOString(),
      };
      this.repository.saveHold(hold);
      this.repository.saveRequest({ ...request, status: "held", updatedAt: now.toISOString() });
      this.audit({
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        action: "schedule_hold.created",
        actor: "customer",
        targetId: hold.holdId,
        result: "success",
        detail: candidate.candidateId,
        at: now.toISOString(),
      });
      return { ok: true, code: "OK", hold: clone(hold) };
    });
  }

  async confirmHold(input: {
    tenantId: string;
    verticalId: string;
    holdId: string;
    customerId: string;
    idempotencyKey: string;
    customerDisplayName: string;
    areaDetail?: string;
    policy?: MatchingPolicy;
    now?: Date;
  }): Promise<ConfirmationResult> {
    const hold = this.repository.getHold(input.tenantId, input.verticalId, input.holdId);
    const key = hold
      ? `${input.tenantId}:${input.verticalId}:${hold.workerId}:${hold.occupancyStartAt}:${hold.occupancyEndAt}`
      : `${input.tenantId}:${input.verticalId}:${input.holdId}`;
    return withSlotLock(key, async () => {
      const empty: ConfirmationResult = {
        ok: false,
        duplicate: false,
        code: "HOLD_NOT_FOUND",
        notificationIntents: [],
        workItems: [],
      };
      const currentHold = this.repository.getHold(input.tenantId, input.verticalId, input.holdId);
      if (!currentHold) return empty;
      if (currentHold.tenantId !== input.tenantId) return { ...empty, code: "TENANT_MISMATCH" };
      if (currentHold.verticalId !== input.verticalId)
        return { ...empty, code: "VERTICAL_MISMATCH" };
      if (currentHold.customerId !== input.customerId)
        return { ...empty, code: "CUSTOMER_MISMATCH" };
      const existing = this.repository
        .listBookings(input.tenantId, input.verticalId)
        .find(
          (booking) =>
            booking.idempotencyKey === input.idempotencyKey ||
            booking.holdId === currentHold.holdId,
        );
      if (existing) {
        const job =
          this.repository.getJob(input.tenantId, input.verticalId, existing.jobId) ?? undefined;
        const conversation = job
          ? (this.repository.getJobConversation(
              input.tenantId,
              input.verticalId,
              job.conversationId,
            ) ?? undefined)
          : undefined;
        return {
          ok: true,
          duplicate: true,
          code: "OK",
          booking: existing,
          ...(job ? { job } : {}),
          ...(conversation ? { conversation } : {}),
          notificationIntents: this.repository.listNotificationIntents(
            input.tenantId,
            input.verticalId,
            existing.jobId,
          ),
          workItems: [],
        };
      }
      const now = input.now ?? this.now();
      if (currentHold.status !== "active") return { ...empty, code: "HOLD_NOT_ACTIVE" };
      if (new Date(currentHold.expiresAt) <= now) {
        this.repository.saveHold({ ...currentHold, status: "expired" });
        const request = this.repository.getRequest(
          input.tenantId,
          input.verticalId,
          currentHold.serviceRequestId,
        );
        if (request)
          this.repository.saveRequest({
            ...request,
            status: "expired",
            updatedAt: now.toISOString(),
          });
        this.audit({
          tenantId: input.tenantId,
          verticalId: input.verticalId,
          action: "schedule_hold.expired",
          actor: "system",
          targetId: currentHold.holdId,
          result: "blocked",
          detail: "confirm after expiry",
          at: now.toISOString(),
        });
        return { ...empty, code: "HOLD_EXPIRED" };
      }
      const reservationConflict = this.repository
        .listReservations(input.tenantId, input.verticalId)
        .some(
          (reservation) =>
            reservation.reservationId !== currentHold.reservationId &&
            reservation.workerId === currentHold.workerId &&
            new Date(reservation.occupancyStartAt) < new Date(currentHold.occupancyEndAt) &&
            new Date(currentHold.occupancyStartAt) < new Date(reservation.occupancyEndAt),
        );
      if (reservationConflict) return { ...empty, code: "DOUBLE_BOOKING" };
      const request = this.repository.getRequest(
        input.tenantId,
        input.verticalId,
        currentHold.serviceRequestId,
      );
      const worker = this.repository
        .listWorkers(input.tenantId, input.verticalId)
        .find((item) => item.workerId === currentHold.workerId);
      if (!request || !worker || worker.status !== "active")
        return { ...empty, code: "CONFIRM_FAILED" };
      const workerDisplayName = worker.displayName;
      const jobId = this.idFactory("job");
      const conversationId = this.idFactory("jobconv");
      const bookingId = this.idFactory("booking");
      let privacyContextId: string | null = null;
      try {
        return this.repository.withTransaction(input.tenantId, input.verticalId, () => {
          const privacyContext = this.privacyBroker.createContext({
            tenantId: input.tenantId,
            verticalId: input.verticalId,
            jobId,
            customerId: request.customerId,
            workerId: worker.workerId,
            customerDisplayName: input.customerDisplayName,
            workerDisplayName,
            serviceType: request.serviceType,
            approximateAreaLabel: request.approximateArea.label,
            ...(input.areaDetail ? { areaDetail: input.areaDetail } : {}),
            startAt: currentHold.startAt,
            endAt: currentHold.endAt,
            requirements: request.requirements,
            now,
          });
          privacyContextId = privacyContext.contextId;
          const customerIdentity = {
            jobId,
            side: "customer" as const,
            publicId: privacyContext.customerPublicId,
            displayName: privacyContext.customerDisplayName,
            expiresAt: privacyContext.expiresAt,
          };
          const workerIdentity = {
            jobId,
            side: "worker" as const,
            publicId: privacyContext.workerPublicId,
            displayName: privacyContext.workerDisplayName,
            expiresAt: privacyContext.expiresAt,
          };
          const job: JobRecord = {
            jobId,
            tenantId: input.tenantId,
            verticalId: input.verticalId,
            bookingId,
            customerId: request.customerId,
            workerId: worker.workerId,
            customerIdentity,
            workerIdentity,
            privacyContextId: privacyContext.contextId,
            conversationId,
            createdAt: now.toISOString(),
            expiresAt: privacyContext.expiresAt,
          };
          const conversation: JobConversation = {
            conversationId,
            tenantId: input.tenantId,
            verticalId: input.verticalId,
            jobId,
            customerAgentId: `customer-agent:${request.customerId}`,
            workerAgentId: `worker-agent:${worker.workerId}`,
            state: "agent_handling",
            customerPaused: false,
            workerPaused: false,
            humanTakeover: false,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          const booking: ScheduledBooking = {
            bookingId,
            tenantId: input.tenantId,
            verticalId: input.verticalId,
            serviceRequestId: request.requestId,
            customerId: request.customerId,
            ...(request.subjectId ? { subjectId: request.subjectId } : {}),
            workerId: worker.workerId,
            serviceType: request.serviceType,
            startAt: currentHold.startAt,
            endAt: currentHold.endAt,
            occupancyStartAt: currentHold.occupancyStartAt,
            occupancyEndAt: currentHold.occupancyEndAt,
            state: transitionBooking("HELD", "CUSTOMER_CONFIRMED"),
            holdId: currentHold.holdId,
            jobId,
            idempotencyKey: input.idempotencyKey,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          const notificationIntents = this.createNotificationIntents({
            input,
            request,
            worker,
            jobId,
            now,
          });
          const workItems = this.createWorkItems({ input, request, worker, booking, now });
          this.repository.saveJob(job);
          this.repository.saveJobConversation(conversation);
          this.repository.saveBooking(booking);
          this.repository.saveHold({ ...currentHold, status: "confirmed" });
          this.repository.saveRequest({
            ...request,
            status: "customer_confirmed",
            updatedAt: now.toISOString(),
          });
          for (const intent of notificationIntents) this.repository.saveNotificationIntent(intent);
          this.audit({
            tenantId: input.tenantId,
            verticalId: input.verticalId,
            action: "booking.customer_confirmed",
            actor: "customer",
            targetId: booking.bookingId,
            result: "success",
            detail: `hold=${currentHold.holdId};privacy=${privacyContext.contextId}`,
            at: now.toISOString(),
          });
          return {
            ok: true,
            duplicate: false,
            code: "OK",
            booking,
            job,
            conversation,
            notificationIntents,
            workItems,
          };
        });
      } catch (error) {
        if (privacyContextId) this.privacyBroker.clearPrivateContextData(privacyContextId);
        throw error;
      }
    });
  }

  markNotificationSent(input: {
    tenantId: string;
    verticalId: string;
    notificationId: string;
  }): MarkNotificationResult {
    const intent = this.repository
      .listNotificationIntents(input.tenantId, input.verticalId)
      .find((item) => item.notificationId === input.notificationId);
    if (!intent) return { ok: false, code: "NOT_FOUND" };
    if (intent.status === "sent") return { ok: false, code: "ALREADY_SENT" };
    this.repository.saveNotificationIntent({ ...intent, status: "sent" });
    const job = this.repository
      .listJobs(input.tenantId, input.verticalId)
      .find((item) => item.jobId === intent.jobId);
    const booking = job
      ? this.repository.getBooking(input.tenantId, input.verticalId, job.bookingId)
      : null;
    let stateChangedBooking: ScheduledBooking | undefined;
    if (booking?.state === "CUSTOMER_CONFIRMED" && intent.audience === "worker") {
      const notified = {
        ...booking,
        state: transitionBooking(booking.state, "WORKER_NOTIFIED"),
        updatedAt: this.now().toISOString(),
      };
      this.repository.saveBooking(notified);
      stateChangedBooking = notified;
      const request = this.repository.getRequest(
        input.tenantId,
        input.verticalId,
        notified.serviceRequestId,
      );
      if (request)
        this.repository.saveRequest({
          ...request,
          status: serviceRequestStatusForBookingState(notified.state),
          updatedAt: notified.updatedAt,
        });
    }
    const all = this.repository.listNotificationIntents(
      input.tenantId,
      input.verticalId,
      intent.jobId,
    );
    if (all.every((item) => item.status === "sent")) {
      const currentBooking = job
        ? this.repository.getBooking(input.tenantId, input.verticalId, job.bookingId)
        : null;
      if (currentBooking && currentBooking.state === "WORKER_NOTIFIED") {
        const next = {
          ...currentBooking,
          state: transitionBooking(currentBooking.state, "SCHEDULED"),
          updatedAt: this.now().toISOString(),
        };
        this.repository.saveBooking(next);
        const request = this.repository.getRequest(
          input.tenantId,
          input.verticalId,
          currentBooking.serviceRequestId,
        );
        if (request)
          this.repository.saveRequest({
            ...request,
            status: serviceRequestStatusForBookingState(next.state),
            updatedAt: next.updatedAt,
          });
        return { ok: true, code: "OK", booking: next };
      }
    }
    return {
      ok: true,
      code: "OK",
      ...(stateChangedBooking ? { booking: stateChangedBooking } : {}),
    };
  }

  getPrivacyView(input: Parameters<PrivacyBroker["getScopedView"]>[0]): PrivacyView | null {
    return this.privacyBroker.getScopedView(input);
  }

  releaseExpiredHolds(tenantId: string, verticalId: string, now = this.now()): number {
    let released = 0;
    for (const hold of this.repository.listHolds(tenantId, verticalId)) {
      if (hold.status !== "active" || new Date(hold.expiresAt) > now) continue;
      this.repository.saveHold({ ...hold, status: "expired" });
      const request = this.repository.getRequest(tenantId, verticalId, hold.serviceRequestId);
      if (request && request.status === "held")
        this.repository.saveRequest({
          ...request,
          status: "expired",
          updatedAt: now.toISOString(),
        });
      this.audit({
        tenantId,
        verticalId,
        action: "schedule_hold.expired",
        actor: "system",
        targetId: hold.holdId,
        result: "success",
        detail: "automatic expiry",
        at: now.toISOString(),
      });
      released += 1;
    }
    return released;
  }

  private createNotificationIntents(input: {
    input: { tenantId: string; verticalId: string };
    request: ServiceRequest;
    worker: Worker;
    jobId: string;
    now: Date;
  }): NotificationIntent[] {
    const base = {
      tenantId: input.input.tenantId,
      verticalId: input.input.verticalId,
      jobId: input.jobId,
      channel: "web" as const,
      purpose: "utility" as const,
      policyRequired: false,
      createdAt: input.now.toISOString(),
    };
    return [
      {
        ...base,
        notificationId: this.idFactory("notify"),
        audience: "customer" as const,
        text: `服务已确认：${input.request.serviceType}，${input.request.approximateArea.label}。平台不会向服务人员公开你的私人电话号码。`,
        status: "queued" as const,
      },
      {
        ...base,
        notificationId: this.idFactory("notify"),
        audience: "worker" as const,
        text: `新工作已确认：${input.request.serviceType}，${input.request.approximateArea.label}。客户私人电话号码默认不会公开。`,
        status: "queued" as const,
      },
    ];
  }

  private createWorkItems(input: {
    input: { tenantId: string; verticalId: string };
    request: ServiceRequest;
    worker: Worker;
    booking: ScheduledBooking;
    now: Date;
  }): { workItemId: string; kind: ServiceWorkItem["kind"] }[] {
    const common = {
      tenantId: input.input.tenantId,
      verticalId: input.input.verticalId,
      kind: "booking_change" as const,
      customerId: input.request.customerId,
      title: "已确认服务的通知待处理",
      intent: "将确认结果分别通知客户与 Worker；出站渠道仍须经过 channel policy gate。",
      basis: [
        `booking:${input.booking.bookingId}`,
        "hold 已验证并转为 confirmed",
        "Privacy Broker context 已建立",
      ],
      effects: ["通知客户", `通知 Worker ${input.worker.workerId}`, "更新 Job Conversation"],
      risk: "low" as const,
      messagePurpose: "utility" as const,
      sourceRef: `booking:${input.booking.bookingId}:confirmation`,
    };
    const sourceRef = common.sourceRef;
    const existing = this.workItems.findBySource?.(
      input.input.tenantId,
      input.input.verticalId,
      sourceRef,
    );
    const item = existing ?? this.workItems.add(common);
    return [{ workItemId: item.id, kind: item.kind }];
  }

  private audit(event: Omit<SchedulingAuditEvent, "auditId">): void {
    this.repository.appendSchedulingAudit({ auditId: this.idFactory("schedule_audit"), ...event });
  }
}

export const smartSchedulingRuntime = new SmartSchedulingRuntime();
