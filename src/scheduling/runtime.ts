import { JobConversationCore } from "@/agent-communication/conversation-core";
import type { JobConversation } from "@/agent-communication/types";
import { PrivacyBroker, DEFAULT_DISCLOSURE_POLICY } from "@/privacy-broker/broker";
import type { PrivacyJobContext } from "@/privacy-broker/types";
import {
  serviceWorkItemRepository,
  type BrowserServiceWorkItemRepository,
} from "@/work-items/repository";
import { matchServiceRequest, DEFAULT_MATCHING_POLICY } from "@/scheduling/matching";
import {
  type ConfirmHoldReceipt,
  type HoldMutationCode,
  type SchedulingRepository,
  BrowserSchedulingRepository,
  schedulingRepository,
} from "@/scheduling/repository";
import type {
  MatchingPolicy,
  SchedulingCandidate,
  SchedulingMatchResult,
  ServiceDurationPolicy,
  ServiceRequest,
  ServiceRequestItem,
  ServiceRequestStatus,
  ServiceScheduleBooking,
  ServiceWorker,
} from "@/scheduling/types";

export interface SchedulingNotificationRequest {
  notificationId: string;
  tenantId: string;
  verticalId: string;
  jobId: string;
  audience: "customer" | "worker";
  summary: string;
  createdAt: string;
}

export interface SchedulingNotificationSink {
  enqueue(input: Omit<SchedulingNotificationRequest, "notificationId">): {
    ok: boolean;
    notificationId: string | null;
    errorCode?: string;
  };
}

export interface SchedulingWorkItemRequest {
  tenantId: string;
  verticalId: string;
  customerId: string;
  workerId: string;
  bookingId: string;
  requestId: string;
  jobId: string;
  serviceStartAt: string;
  createdAt: string;
}

export interface SchedulingWorkItemSink {
  createBookingWorkItem(input: SchedulingWorkItemRequest): {
    ok: boolean;
    duplicate: boolean;
    workItemId: string | null;
    errorCode?: string;
  };
}

/**
 * Reuses the existing Service Work Item organ. Booking notifications remain
 * approval/policy work rather than becoming a second direct-send system.
 */
export class ServiceSchedulingWorkItemSink implements SchedulingWorkItemSink {
  constructor(
    private readonly workItems: BrowserServiceWorkItemRepository = serviceWorkItemRepository,
  ) {}

  createBookingWorkItem(input: SchedulingWorkItemRequest) {
    const sourceRef = `schedule-confirm:${input.bookingId}`;
    const existing = this.workItems.findBySource(input.tenantId, input.verticalId, sourceRef);
    if (existing) {
      return { ok: true, duplicate: true, workItemId: existing.id };
    }

    try {
      const item = this.workItems.add({
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        kind: "booking_change",
        customerId: input.customerId,
        title: `已确认排程 · ${input.bookingId}`,
        intent: "记录已确认 Job 的双方通知与后续人工检查入口。",
        basis: [
          `booking=${input.bookingId}`,
          `request=${input.requestId}`,
          `job=${input.jobId}`,
          `worker=${input.workerId}`,
          `service_start=${input.serviceStartAt}`,
        ],
        effects: [
          "建立 Worker 与 Customer 通知 intent",
          "通知实际发送仍须通过统一 Channel Adapter 与既有 WhatsApp Policy Gate",
          "不把私人电话号码或精确地址写入 Work Item",
        ],
        risk: "low",
        sourceRef,
      });
      return { ok: true, duplicate: false, workItemId: item.id };
    } catch (error) {
      return {
        ok: false,
        duplicate: false,
        workItemId: null,
        errorCode: error instanceof Error ? error.message : "WORK_ITEM_CREATE_FAILED",
      };
    }
  }
}

export class InMemorySchedulingNotificationSink implements SchedulingNotificationSink {
  readonly notifications: SchedulingNotificationRequest[] = [];
  failNext = false;

  enqueue(input: Omit<SchedulingNotificationRequest, "notificationId">) {
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, notificationId: null, errorCode: "NOTIFICATION_QUEUE_FAILED" };
    }
    const notification = { ...input, notificationId: makeId("notify") };
    this.notifications.push(notification);
    return { ok: true, notificationId: notification.notificationId };
  }
}

export interface SchedulingAuditEvent {
  eventId: string;
  tenantId: string;
  verticalId: string;
  jobId?: string;
  action: string;
  result: "success" | "blocked" | "failed";
  detail: string;
  occurredAt: string;
}

export interface SchedulingHoldReceipt {
  ok: boolean;
  duplicate: boolean;
  code: HoldMutationCode | "CANDIDATE_NOT_AVAILABLE" | "REQUEST_NOT_FOUND";
  hold: ReturnType<SchedulingRepository["getHold"]>;
  candidate: SchedulingCandidate | null;
}

export interface SchedulingConfirmationReceipt {
  ok: boolean;
  duplicate: boolean;
  status: "scheduled" | "duplicate" | "failed";
  code:
    | HoldMutationCode
    | "CONFIRMATION_FAILED"
    | "PRIVACY_CONTEXT_FAILED"
    | "WORK_ITEM_CREATE_FAILED"
    | "NOTIFICATION_QUEUE_FAILED";
  booking: ServiceScheduleBooking | null;
  request: ServiceRequest | null;
  privacyContext: PrivacyJobContext | null;
  conversation: JobConversation | null;
  notifications: string[];
  workItemId?: string;
  errors: string[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function scopedKey(tenantId: string, verticalId: string, id: string): string {
  return `${tenantId}:${verticalId}:${id}`;
}

function addMinutes(at: string, minutes: number): string {
  return new Date(new Date(at).getTime() + minutes * 60_000).toISOString();
}

function areaLabel(request: ServiceRequest): string | undefined {
  return (
    request.approximateArea?.label ??
    request.approximateArea?.areaId ??
    request.approximateArea?.postalCode
  );
}

function requestSummary(request: ServiceRequest): string {
  return request.serviceItems.length > 0
    ? `${request.serviceType} · ${request.serviceItems.map((item) => item.label ?? item.itemId).join("、")}`
    : request.serviceType;
}

function workerBlocks(
  worker: ServiceWorker,
  repository: SchedulingRepository,
  tenantId: string,
  verticalId: string,
): ServiceWorker {
  const bookingBlocks = repository
    .listBookings(tenantId, verticalId)
    .filter(
      (booking) =>
        booking.workerId === worker.id &&
        booking.status !== "CANCELLED" &&
        booking.status !== "FAILED",
    )
    .map((booking) => ({
      id: `booking-block:${booking.bookingId}`,
      startAt: booking.reservedStartAt,
      endAt: booking.reservedEndAt,
      kind: "confirmed_booking" as const,
      status: "active" as const,
      sourceId: booking.bookingId,
    }));
  const holdBlocks = repository
    .listHolds(tenantId, verticalId)
    .filter((hold) => hold.workerId === worker.id && hold.status === "ACTIVE")
    .map((hold) => ({
      id: `hold-block:${hold.holdId}`,
      startAt: hold.reservedStartAt,
      endAt: hold.reservedEndAt,
      kind: "hold" as const,
      status: "active" as const,
      sourceId: hold.holdId,
    }));
  return {
    ...clone(worker),
    availability: {
      ...clone(worker.availability),
      blocks: [...clone(worker.availability.blocks), ...bookingBlocks, ...holdBlocks],
    },
  };
}

/**
 * Phase 1 scheduling application service. It owns the request → match → hold
 * → confirm flow, while pure matching and persistence stay replaceable.
 */
export class ServiceSchedulingRuntime {
  private readonly privacyBroker: PrivacyBroker;
  private readonly notificationSink: SchedulingNotificationSink;
  private readonly workItemSink: SchedulingWorkItemSink;
  private readonly policy: MatchingPolicy;
  private readonly conversations = new Map<string, JobConversationCore>();
  private readonly confirmations = new Map<string, SchedulingConfirmationReceipt>();
  private readonly auditEvents: SchedulingAuditEvent[] = [];

  constructor(
    private readonly repository: SchedulingRepository = schedulingRepository,
    options?: {
      privacyBroker?: PrivacyBroker;
      notificationSink?: SchedulingNotificationSink;
      workItemSink?: SchedulingWorkItemSink;
      policy?: Partial<MatchingPolicy>;
    },
  ) {
    this.privacyBroker = options?.privacyBroker ?? new PrivacyBroker();
    this.notificationSink = options?.notificationSink ?? new InMemorySchedulingNotificationSink();
    this.workItemSink = options?.workItemSink ?? new ServiceSchedulingWorkItemSink();
    this.policy = {
      ...DEFAULT_MATCHING_POLICY,
      ...(options?.policy ?? {}),
      weights: { ...DEFAULT_MATCHING_POLICY.weights, ...(options?.policy?.weights ?? {}) },
    };
  }

  createRequest(input: {
    tenantId: string;
    verticalId: string;
    customerId: string;
    serviceType: string;
    serviceItems?: ServiceRequestItem[];
    approximateArea?: ServiceRequest["approximateArea"];
    requestedDate?: string;
    requestedTime?: string;
    timeWindowStart?: string;
    timeWindowEnd?: string;
    estimatedDurationMin?: number;
    urgency?: ServiceRequest["urgency"];
    requirements?: string[];
    attachments?: string[];
    specialConstraints?: string[];
    privacyLevel?: ServiceRequest["privacyLevel"];
    preference?: ServiceRequest["preference"];
    now?: string;
  }): ServiceRequest {
    const now = input.now ?? new Date().toISOString();
    const request: ServiceRequest = {
      requestId: makeId("request"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      customerId: input.customerId,
      serviceType: input.serviceType,
      serviceItems: clone(input.serviceItems ?? []),
      ...(input.approximateArea ? { approximateArea: clone(input.approximateArea) } : {}),
      ...(input.requestedDate ? { requestedDate: input.requestedDate } : {}),
      ...(input.requestedTime ? { requestedTime: input.requestedTime } : {}),
      ...(input.timeWindowStart ? { timeWindowStart: input.timeWindowStart } : {}),
      ...(input.timeWindowEnd ? { timeWindowEnd: input.timeWindowEnd } : {}),
      ...(input.estimatedDurationMin === undefined
        ? {}
        : { estimatedDurationMin: input.estimatedDurationMin }),
      urgency: input.urgency ?? "normal",
      requirements: [...(input.requirements ?? [])],
      attachments: [...(input.attachments ?? [])],
      specialConstraints: [...(input.specialConstraints ?? [])],
      privacyLevel: input.privacyLevel ?? "standard",
      status: "DRAFT",
      ...(input.preference ? { preference: clone(input.preference) } : {}),
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.addRequest(request);
  }

  getRequest(tenantId: string, verticalId: string, requestId: string): ServiceRequest | null {
    return this.repository.getRequest(tenantId, verticalId, requestId);
  }

  findMatches(input: {
    tenantId: string;
    verticalId: string;
    requestId: string;
    durationPolicies: readonly ServiceDurationPolicy[];
    timezone: string;
    now?: Date;
  }): SchedulingMatchResult {
    const request = this.repository.getRequest(input.tenantId, input.verticalId, input.requestId);
    if (!request || request.verticalId !== input.verticalId) {
      throw new Error("REQUEST_NOT_FOUND_OR_SCOPE_MISMATCH");
    }
    if (
      request.status === "DRAFT" ||
      request.status === "FAILED" ||
      request.status === "DECLINED" ||
      request.status === "RESCHEDULE_REQUIRED"
    ) {
      this.repository.updateRequest(input.tenantId, input.verticalId, request.requestId, {
        status: "MATCHING",
        updatedAt: input.now?.toISOString() ?? new Date().toISOString(),
      });
    }
    const workers = this.repository
      .listWorkers(input.tenantId, input.verticalId)
      .map((worker) => workerBlocks(worker, this.repository, input.tenantId, input.verticalId));
    const result = matchServiceRequest({
      request:
        this.repository.getRequest(input.tenantId, input.verticalId, input.requestId) ?? request,
      workers,
      durationPolicies: input.durationPolicies,
      timezone: input.timezone,
      policy: this.policy,
      ...(input.now ? { now: input.now } : {}),
    });
    const current = this.repository.getRequest(input.tenantId, input.verticalId, input.requestId);
    if (result.candidates.length > 0 && current?.status === "MATCHING") {
      this.repository.updateRequest(input.tenantId, input.verticalId, input.requestId, {
        status: "OFFERED",
      });
    }
    this.appendAudit({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      action: "SERVICE_REQUEST_MATCHED",
      result: "success",
      detail: `${result.candidates.length} candidates; ${result.excluded.length} workers excluded`,
      occurredAt: input.now?.toISOString() ?? new Date().toISOString(),
    });
    return result;
  }

  holdCandidate(input: {
    tenantId: string;
    verticalId: string;
    requestId: string;
    candidateId: string;
    durationPolicies: readonly ServiceDurationPolicy[];
    timezone: string;
    idempotencyKey: string;
    holdDurationMin?: number;
    now?: Date;
  }): SchedulingHoldReceipt {
    const now = input.now ?? new Date();
    const request = this.repository.getRequest(input.tenantId, input.verticalId, input.requestId);
    if (!request || request.verticalId !== input.verticalId) {
      return {
        ok: false,
        duplicate: false,
        code: "REQUEST_NOT_FOUND",
        hold: null,
        candidate: null,
      };
    }
    const existingHold = this.repository
      .listHolds(input.tenantId, input.verticalId)
      .find(
        (hold) =>
          hold.serviceRequestId === input.requestId && hold.idempotencyKey === input.idempotencyKey,
      );
    if (existingHold) {
      return { ok: true, duplicate: true, code: "DUPLICATE", hold: existingHold, candidate: null };
    }
    const match = this.findMatches({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      requestId: input.requestId,
      durationPolicies: input.durationPolicies,
      timezone: input.timezone,
      now,
    });
    const candidate = match.candidates.find((row) => row.candidateId === input.candidateId) ?? null;
    if (!candidate) {
      return {
        ok: false,
        duplicate: false,
        code: "CANDIDATE_NOT_AVAILABLE",
        hold: null,
        candidate: null,
      };
    }
    const receipt = this.repository.createHold({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      requestId: input.requestId,
      workerId: candidate.workerId,
      customerId: request.customerId,
      candidateId: candidate.candidateId,
      serviceStartAt: candidate.serviceStartAt,
      serviceEndAt: candidate.serviceEndAt,
      reservedStartAt: candidate.reservedStartAt,
      reservedEndAt: candidate.reservedEndAt,
      expiresAt: addMinutes(
        now.toISOString(),
        input.holdDurationMin ?? this.policy.holdDurationMin,
      ),
      idempotencyKey: input.idempotencyKey,
      now: now.toISOString(),
    });
    this.appendAudit({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      action: "SCHEDULE_HOLD_CREATED",
      result: receipt.ok ? "success" : "blocked",
      detail: `${receipt.code}:${candidate.candidateId}`,
      occurredAt: now.toISOString(),
    });
    return { ...receipt, candidate };
  }

  confirmHold(input: {
    tenantId: string;
    verticalId: string;
    holdId: string;
    idempotencyKey: string;
    now?: Date;
  }): SchedulingConfirmationReceipt {
    const now = input.now ?? new Date();
    const confirmationKey = scopedKey(input.tenantId, input.verticalId, input.holdId);
    const existingCached = this.confirmations.get(confirmationKey);
    if (existingCached) return clone({ ...existingCached, duplicate: true, status: "duplicate" });

    const core: ConfirmHoldReceipt = this.repository.confirmHold({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      holdId: input.holdId,
      idempotencyKey: input.idempotencyKey,
      now: now.toISOString(),
    });
    if (!core.ok || !core.booking || !core.request) {
      const failed: SchedulingConfirmationReceipt = {
        ok: false,
        duplicate: core.duplicate,
        status: "failed",
        code: core.code,
        booking: core.booking,
        request: core.request,
        privacyContext: null,
        conversation: null,
        notifications: [],
        errors: [core.code],
      };
      return failed;
    }
    if (core.duplicate) {
      return {
        ok: true,
        duplicate: true,
        status: "duplicate",
        code: "DUPLICATE",
        booking: core.booking,
        request: core.request,
        privacyContext: null,
        conversation: null,
        notifications: [],
        errors: [],
      };
    }

    const jobId = `job_${core.booking.bookingId}`;
    let privacyContext: PrivacyJobContext;
    try {
      const approximateArea = areaLabel(core.request);
      privacyContext = this.privacyBroker.createJobContext({
        jobId,
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        customerId: core.booking.customerId,
        workerId: core.booking.workerId,
        serviceSummary: requestSummary(core.request),
        ...(approximateArea ? { approximateArea } : {}),
        schedule: {
          serviceStartAt: core.booking.serviceStartAt,
          serviceEndAt: core.booking.serviceEndAt,
        },
        preparation: core.request.requirements,
        policy: DEFAULT_DISCLOSURE_POLICY,
        now: now.toISOString(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.repository.markConfirmationFailed(
        input.tenantId,
        input.verticalId,
        input.holdId,
        reason,
        now.toISOString(),
      );
      return {
        ok: false,
        duplicate: false,
        status: "failed",
        code: "PRIVACY_CONTEXT_FAILED",
        booking:
          this.repository
            .listBookings(input.tenantId, input.verticalId)
            .find((item) => item.holdId === input.holdId) ?? null,
        request: this.repository.getRequest(
          input.tenantId,
          input.verticalId,
          core.request.requestId,
        ),
        privacyContext: null,
        conversation: null,
        notifications: [],
        errors: [reason],
      };
    }

    const conversationCore = new JobConversationCore(
      {
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        jobId,
        customerIdentity: privacyContext.customerIdentity.alias,
        workerIdentity: privacyContext.workerIdentity.alias,
        now: now.toISOString(),
      },
      this.privacyBroker,
    );
    this.conversations.set(
      scopedKey(input.tenantId, input.verticalId, core.booking.bookingId),
      conversationCore,
    );

    const workItem = this.workItemSink.createBookingWorkItem({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      customerId: core.booking.customerId,
      workerId: core.booking.workerId,
      bookingId: core.booking.bookingId,
      requestId: core.request.requestId,
      jobId,
      serviceStartAt: core.booking.serviceStartAt,
      createdAt: now.toISOString(),
    });
    if (!workItem.ok || !workItem.workItemId) {
      const reason = workItem.errorCode ?? "WORK_ITEM_CREATE_FAILED";
      this.repository.markConfirmationFailed(
        input.tenantId,
        input.verticalId,
        input.holdId,
        reason,
        now.toISOString(),
      );
      this.appendAudit({
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        jobId,
        action: "SCHEDULE_CONFIRM_FAILED",
        result: "failed",
        detail: reason,
        occurredAt: now.toISOString(),
      });
      return {
        ok: false,
        duplicate: false,
        status: "failed",
        code: "WORK_ITEM_CREATE_FAILED",
        booking:
          this.repository
            .listBookings(input.tenantId, input.verticalId)
            .find((item) => item.holdId === input.holdId) ?? null,
        request: this.repository.getRequest(
          input.tenantId,
          input.verticalId,
          core.request.requestId,
        ),
        privacyContext,
        conversation: conversationCore.snapshot(),
        notifications: [],
        errors: [reason],
      };
    }
    const workItemId = workItem.workItemId;

    const notificationIds: string[] = [];
    for (const audience of ["worker", "customer"] as const) {
      const notification = this.notificationSink.enqueue({
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        jobId,
        audience,
        summary:
          audience === "worker" ? "New job notification queued" : "Booking confirmation queued",
        createdAt: now.toISOString(),
      });
      if (!notification.ok || !notification.notificationId) {
        const reason = notification.errorCode ?? "NOTIFICATION_QUEUE_FAILED";
        this.repository.markConfirmationFailed(
          input.tenantId,
          input.verticalId,
          input.holdId,
          reason,
          now.toISOString(),
        );
        this.appendAudit({
          tenantId: input.tenantId,
          verticalId: input.verticalId,
          jobId,
          action: "SCHEDULE_CONFIRM_FAILED",
          result: "failed",
          detail: reason,
          occurredAt: now.toISOString(),
        });
        return {
          ok: false,
          duplicate: false,
          status: "failed",
          code: "NOTIFICATION_QUEUE_FAILED",
          booking:
            this.repository
              .listBookings(input.tenantId, input.verticalId)
              .find((item) => item.holdId === input.holdId) ?? null,
          request: this.repository.getRequest(
            input.tenantId,
            input.verticalId,
            core.request.requestId,
          ),
          privacyContext,
          conversation: conversationCore.snapshot(),
          notifications: notificationIds,
          workItemId,
          errors: [reason],
        };
      }
      notificationIds.push(notification.notificationId);
    }

    const scheduled = this.repository.markScheduled(
      input.tenantId,
      input.verticalId,
      core.booking.bookingId,
      now.toISOString(),
    );
    if (!scheduled) {
      const reason = "SCHEDULE_STATUS_COMMIT_FAILED";
      this.repository.markConfirmationFailed(
        input.tenantId,
        input.verticalId,
        input.holdId,
        reason,
        now.toISOString(),
      );
      return {
        ok: false,
        duplicate: false,
        status: "failed",
        code: "INVALID_STATE",
        booking:
          this.repository
            .listBookings(input.tenantId, input.verticalId)
            .find((item) => item.holdId === input.holdId) ?? null,
        request: this.repository.getRequest(
          input.tenantId,
          input.verticalId,
          core.request.requestId,
        ),
        privacyContext,
        conversation: conversationCore.snapshot(),
        notifications: notificationIds,
        workItemId,
        errors: [reason],
      };
    }

    const receipt: SchedulingConfirmationReceipt = {
      ok: true,
      duplicate: false,
      status: "scheduled",
      code: "OK",
      booking: scheduled,
      request: this.repository.getRequest(input.tenantId, input.verticalId, core.request.requestId),
      privacyContext,
      conversation: conversationCore.snapshot(),
      notifications: notificationIds,
      workItemId,
      errors: [],
    };
    this.confirmations.set(confirmationKey, clone(receipt));
    this.appendAudit({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      jobId,
      action: "SCHEDULE_CONFIRMED",
      result: "success",
      detail: "Hold → Confirm → Lock → notification intents → Job privacy context",
      occurredAt: now.toISOString(),
    });
    return clone(receipt);
  }

  getJobConversation(
    tenantId: string,
    verticalId: string,
    bookingId: string,
  ): JobConversation | null {
    return this.conversations.get(scopedKey(tenantId, verticalId, bookingId))?.snapshot() ?? null;
  }

  getPrivacyBroker(): PrivacyBroker {
    return this.privacyBroker;
  }

  listAuditEvents(input: { tenantId: string; verticalId: string }): SchedulingAuditEvent[] {
    return clone(
      this.auditEvents.filter(
        (event) => event.tenantId === input.tenantId && event.verticalId === input.verticalId,
      ),
    );
  }

  expireHolds(now = new Date()): number {
    return this.repository.expireHolds(now.toISOString()).length;
  }

  private appendAudit(input: Omit<SchedulingAuditEvent, "eventId">): void {
    this.auditEvents.push({ eventId: makeId("sched_audit"), ...input });
  }
}

export const serviceSchedulingRuntime = new ServiceSchedulingRuntime();

export function isSchedulingRepositoryBrowser(
  repository: SchedulingRepository,
): repository is BrowserSchedulingRepository {
  return repository instanceof BrowserSchedulingRepository;
}

export function schedulingRequestStatusLabel(status: ServiceRequestStatus): string {
  const labels: Record<ServiceRequestStatus, string> = {
    DRAFT: "草稿",
    MATCHING: "匹配中",
    OFFERED: "已提供时段",
    HELD: "暂时锁定",
    CUSTOMER_CONFIRMED: "客户已确认",
    WORKER_NOTIFIED: "已建立师傅通知",
    SCHEDULED: "已排程",
    IN_PROGRESS: "服务进行中",
    COMPLETED: "已完成",
    EXPIRED: "已过期",
    CANCELLED: "已取消",
    DECLINED: "已拒绝",
    RESCHEDULE_REQUIRED: "需要改期",
    FAILED: "处理失败",
  };
  return labels[status];
}
