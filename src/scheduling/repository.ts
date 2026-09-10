import type {
  JobConversation,
  JobRecord,
  NotificationIntent,
  ScheduleHold,
  ScheduleReservation,
  ScheduledBooking,
  SchedulingAuditEvent,
  ServiceRequest,
  Worker,
} from "@/scheduling/types";
import type {
  PrivacyAuditEvent,
  PrivacyConsentRecord,
  PrivacyContext,
  PrivacyRepository,
} from "@/privacy/types";

export interface SchedulingRepository extends PrivacyRepository {
  listWorkers(tenantId: string, verticalId: string): Worker[];
  saveWorker(worker: Worker): void;
  getRequest(tenantId: string, verticalId: string, requestId: string): ServiceRequest | null;
  saveRequest(request: ServiceRequest): void;
  listHolds(tenantId: string, verticalId: string): ScheduleHold[];
  getHold(tenantId: string, verticalId: string, holdId: string): ScheduleHold | null;
  saveHold(hold: ScheduleHold): void;
  listBookings(tenantId: string, verticalId: string): ScheduledBooking[];
  getBooking(tenantId: string, verticalId: string, bookingId: string): ScheduledBooking | null;
  saveBooking(booking: ScheduledBooking): void;
  listReservations(tenantId: string, verticalId: string): ScheduleReservation[];
  listJobs(tenantId: string, verticalId: string): JobRecord[];
  getJob(tenantId: string, verticalId: string, jobId: string): JobRecord | null;
  saveJob(job: JobRecord): void;
  getJobConversation(
    tenantId: string,
    verticalId: string,
    conversationId: string,
  ): JobConversation | null;
  saveJobConversation(conversation: JobConversation): void;
  listNotificationIntents(
    tenantId: string,
    verticalId: string,
    jobId?: string,
  ): NotificationIntent[];
  saveNotificationIntent(intent: NotificationIntent): void;
  appendSchedulingAudit(event: SchedulingAuditEvent): void;
  listSchedulingAudit(tenantId: string, verticalId: string): SchedulingAuditEvent[];
  withTransaction<T>(tenantId: string, verticalId: string, action: () => T): T;
}

interface SchedulingState {
  workers: Worker[];
  requests: ServiceRequest[];
  holds: ScheduleHold[];
  bookings: ScheduledBooking[];
  jobs: JobRecord[];
  jobConversations: JobConversation[];
  notificationIntents: NotificationIntent[];
  schedulingAudit: SchedulingAuditEvent[];
  privacyContexts: PrivacyContext[];
  privacyConsents: PrivacyConsentRecord[];
  privacyAudit: PrivacyAuditEvent[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function emptyState(): SchedulingState {
  return {
    workers: [],
    requests: [],
    holds: [],
    bookings: [],
    jobs: [],
    jobConversations: [],
    notificationIntents: [],
    schedulingAudit: [],
    privacyContexts: [],
    privacyConsents: [],
    privacyAudit: [],
  };
}

function scoped<T extends { tenantId: string; verticalId: string }>(
  rows: readonly T[],
  tenantId: string,
  verticalId: string,
): T[] {
  return rows
    .filter((row) => row.tenantId === tenantId && row.verticalId === verticalId)
    .map(clone);
}

function replaceScoped<T extends { tenantId: string; verticalId: string; [key: string]: unknown }>(
  rows: T[],
  value: T,
  identity: (row: T) => boolean,
): void {
  const index = rows.findIndex(identity);
  if (index < 0) rows.push(clone(value));
  else rows[index] = clone(value);
}

export class InMemorySchedulingRepository implements SchedulingRepository {
  private state: SchedulingState;

  constructor(initial?: Partial<SchedulingState>) {
    this.state = { ...emptyState(), ...clone(initial ?? {}) };
  }

  listWorkers(tenantId: string, verticalId: string): Worker[] {
    return scoped(this.state.workers, tenantId, verticalId);
  }
  saveWorker(worker: Worker): void {
    replaceScoped(
      this.state.workers as (Worker & { [key: string]: unknown })[],
      worker as Worker & { [key: string]: unknown },
      (row) =>
        row.workerId === worker.workerId &&
        row.tenantId === worker.tenantId &&
        row.verticalId === worker.verticalId,
    );
  }
  getRequest(tenantId: string, verticalId: string, requestId: string): ServiceRequest | null {
    const row = this.state.requests.find(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.requestId === requestId,
    );
    return row ? clone(row) : null;
  }
  saveRequest(request: ServiceRequest): void {
    replaceScoped(
      this.state.requests as (ServiceRequest & { [key: string]: unknown })[],
      request as ServiceRequest & { [key: string]: unknown },
      (row) =>
        row.requestId === request.requestId &&
        row.tenantId === request.tenantId &&
        row.verticalId === request.verticalId,
    );
  }
  listHolds(tenantId: string, verticalId: string): ScheduleHold[] {
    return scoped(this.state.holds, tenantId, verticalId);
  }
  getHold(tenantId: string, verticalId: string, holdId: string): ScheduleHold | null {
    const row = this.state.holds.find(
      (item) =>
        item.tenantId === tenantId && item.verticalId === verticalId && item.holdId === holdId,
    );
    return row ? clone(row) : null;
  }
  saveHold(hold: ScheduleHold): void {
    replaceScoped(
      this.state.holds as (ScheduleHold & { [key: string]: unknown })[],
      hold as ScheduleHold & { [key: string]: unknown },
      (row) =>
        row.holdId === hold.holdId &&
        row.tenantId === hold.tenantId &&
        row.verticalId === hold.verticalId,
    );
  }
  listBookings(tenantId: string, verticalId: string): ScheduledBooking[] {
    return scoped(this.state.bookings, tenantId, verticalId);
  }
  getBooking(tenantId: string, verticalId: string, bookingId: string): ScheduledBooking | null {
    const row = this.state.bookings.find(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.bookingId === bookingId,
    );
    return row ? clone(row) : null;
  }
  saveBooking(booking: ScheduledBooking): void {
    replaceScoped(
      this.state.bookings as (ScheduledBooking & { [key: string]: unknown })[],
      booking as ScheduledBooking & { [key: string]: unknown },
      (row) =>
        row.bookingId === booking.bookingId &&
        row.tenantId === booking.tenantId &&
        row.verticalId === booking.verticalId,
    );
  }
  listReservations(tenantId: string, verticalId: string): ScheduleReservation[] {
    const bookings: ScheduleReservation[] = this.state.bookings
      .filter(
        (booking) =>
          booking.tenantId === tenantId &&
          booking.verticalId === verticalId &&
          booking.state !== "CANCELLED" &&
          booking.state !== "EXPIRED",
      )
      .map((booking) => ({
        reservationId: `booking:${booking.bookingId}`,
        tenantId: booking.tenantId,
        verticalId: booking.verticalId,
        workerId: booking.workerId,
        kind: "booking",
        serviceRequestId: booking.serviceRequestId,
        bookingId: booking.bookingId,
        holdId: booking.holdId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        occupancyStartAt: booking.occupancyStartAt,
        occupancyEndAt: booking.occupancyEndAt,
        status: "confirmed",
      }));
    const holds: ScheduleReservation[] = this.state.holds
      .filter(
        (hold) =>
          hold.tenantId === tenantId && hold.verticalId === verticalId && hold.status === "active",
      )
      .map((hold) => ({
        reservationId: hold.reservationId,
        tenantId: hold.tenantId,
        verticalId: hold.verticalId,
        workerId: hold.workerId,
        kind: "hold",
        serviceRequestId: hold.serviceRequestId,
        holdId: hold.holdId,
        startAt: hold.startAt,
        endAt: hold.endAt,
        occupancyStartAt: hold.occupancyStartAt,
        occupancyEndAt: hold.occupancyEndAt,
        status: "held",
        expiresAt: hold.expiresAt,
      }));
    return [...bookings, ...holds];
  }
  listJobs(tenantId: string, verticalId: string): JobRecord[] {
    return scoped(this.state.jobs, tenantId, verticalId);
  }
  getJob(tenantId: string, verticalId: string, jobId: string): JobRecord | null {
    const row = this.state.jobs.find(
      (item) =>
        item.tenantId === tenantId && item.verticalId === verticalId && item.jobId === jobId,
    );
    return row ? clone(row) : null;
  }
  saveJob(job: JobRecord): void {
    replaceScoped(
      this.state.jobs as (JobRecord & { [key: string]: unknown })[],
      job as JobRecord & { [key: string]: unknown },
      (row) =>
        row.jobId === job.jobId &&
        row.tenantId === job.tenantId &&
        row.verticalId === job.verticalId,
    );
  }
  getJobConversation(
    tenantId: string,
    verticalId: string,
    conversationId: string,
  ): JobConversation | null {
    const row = this.state.jobConversations.find(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.conversationId === conversationId,
    );
    return row ? clone(row) : null;
  }
  saveJobConversation(conversation: JobConversation): void {
    replaceScoped(
      this.state.jobConversations as (JobConversation & { [key: string]: unknown })[],
      conversation as JobConversation & { [key: string]: unknown },
      (row) =>
        row.conversationId === conversation.conversationId &&
        row.tenantId === conversation.tenantId &&
        row.verticalId === conversation.verticalId,
    );
  }
  listNotificationIntents(
    tenantId: string,
    verticalId: string,
    jobId?: string,
  ): NotificationIntent[] {
    return scoped(this.state.notificationIntents, tenantId, verticalId).filter(
      (item) => !jobId || item.jobId === jobId,
    );
  }
  saveNotificationIntent(intent: NotificationIntent): void {
    replaceScoped(
      this.state.notificationIntents as (NotificationIntent & { [key: string]: unknown })[],
      intent as NotificationIntent & { [key: string]: unknown },
      (row) =>
        row.notificationId === intent.notificationId &&
        row.tenantId === intent.tenantId &&
        row.verticalId === intent.verticalId,
    );
  }
  appendSchedulingAudit(event: SchedulingAuditEvent): void {
    this.state.schedulingAudit.push(clone(event));
  }
  listSchedulingAudit(tenantId: string, verticalId: string): SchedulingAuditEvent[] {
    return scoped(this.state.schedulingAudit, tenantId, verticalId);
  }

  getContext(tenantId: string, contextId: string): PrivacyContext | null {
    const row = this.state.privacyContexts.find(
      (item) => item.tenantId === tenantId && item.contextId === contextId,
    );
    return row ? clone(row) : null;
  }
  saveContext(context: PrivacyContext): void {
    replaceScoped(
      this.state.privacyContexts as (PrivacyContext & { [key: string]: unknown })[],
      context as PrivacyContext & { [key: string]: unknown },
      (row) =>
        row.contextId === context.contextId &&
        row.tenantId === context.tenantId &&
        row.verticalId === context.verticalId,
    );
  }
  updateContext(
    tenantId: string,
    contextId: string,
    patch: Partial<PrivacyContext>,
  ): PrivacyContext | null {
    const current = this.state.privacyContexts.find(
      (item) => item.tenantId === tenantId && item.contextId === contextId,
    );
    if (!current) return null;
    Object.assign(current, clone(patch));
    return clone(current);
  }
  getConsent(
    tenantId: string,
    verticalId: string,
    contextId: string,
    capability: PrivacyConsentRecord["capability"],
    purpose: string,
  ): PrivacyConsentRecord | null {
    const row = this.state.privacyConsents.find(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.contextId === contextId &&
        item.capability === capability &&
        item.purpose === purpose,
    );
    return row ? clone(row) : null;
  }
  saveConsent(consent: PrivacyConsentRecord): void {
    replaceScoped(
      this.state.privacyConsents as (PrivacyConsentRecord & { [key: string]: unknown })[],
      consent as PrivacyConsentRecord & { [key: string]: unknown },
      (row) =>
        row.consentId === consent.consentId &&
        row.tenantId === consent.tenantId &&
        row.verticalId === consent.verticalId,
    );
  }
  appendAudit(event: PrivacyAuditEvent): void {
    this.state.privacyAudit.push(clone(event));
  }
  listAudit(tenantId: string, verticalId: string, contextId?: string): PrivacyAuditEvent[] {
    return this.state.privacyAudit
      .filter(
        (event) =>
          event.tenantId === tenantId &&
          event.verticalId === verticalId &&
          (!contextId || event.contextId === contextId),
      )
      .map(clone);
  }
  withTransaction<T>(_tenantId: string, _verticalId: string, action: () => T): T {
    const snapshot = clone(this.state);
    try {
      return action();
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  snapshot(): SchedulingState {
    return clone(this.state);
  }
}

const STORAGE_KEYS = {
  workers: "service-frontdesk.scheduling.workers.v1",
  requests: "service-frontdesk.scheduling.requests.v1",
  holds: "service-frontdesk.scheduling.holds.v1",
  bookings: "service-frontdesk.scheduling.bookings.v1",
  jobs: "service-frontdesk.scheduling.jobs.v1",
  jobConversations: "service-frontdesk.scheduling.job-conversations.v1",
  notificationIntents: "service-frontdesk.scheduling.notifications.v1",
  schedulingAudit: "service-frontdesk.scheduling.audit.v1",
  privacyContexts: "service-frontdesk.privacy.contexts.v1",
  privacyConsents: "service-frontdesk.privacy.consents.v1",
  privacyAudit: "service-frontdesk.privacy.audit.v1",
} as const;

export class BrowserSchedulingRepository implements SchedulingRepository {
  private read<T>(key: string): T[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  private write<T>(key: string, rows: T[]): void {
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(rows));
  }
  private replace<T extends { tenantId: string; verticalId: string }>(
    key: string,
    value: T,
    identity: (row: T) => boolean,
  ): void {
    const rows = this.read<T>(key);
    const index = rows.findIndex(identity);
    if (index < 0) rows.push(clone(value));
    else rows[index] = clone(value);
    this.write(key, rows);
  }
  listWorkers(tenantId: string, verticalId: string): Worker[] {
    return scoped(this.read<Worker>(STORAGE_KEYS.workers), tenantId, verticalId);
  }
  saveWorker(worker: Worker): void {
    this.replace(
      STORAGE_KEYS.workers,
      worker,
      (row) =>
        row.workerId === worker.workerId &&
        row.tenantId === worker.tenantId &&
        row.verticalId === worker.verticalId,
    );
  }
  getRequest(tenantId: string, verticalId: string, requestId: string): ServiceRequest | null {
    return (
      this.read<ServiceRequest>(STORAGE_KEYS.requests).find(
        (row) =>
          row.tenantId === tenantId && row.verticalId === verticalId && row.requestId === requestId,
      ) ?? null
    );
  }
  saveRequest(request: ServiceRequest): void {
    this.replace(
      STORAGE_KEYS.requests,
      request,
      (row) =>
        row.requestId === request.requestId &&
        row.tenantId === request.tenantId &&
        row.verticalId === request.verticalId,
    );
  }
  listHolds(tenantId: string, verticalId: string): ScheduleHold[] {
    return scoped(this.read<ScheduleHold>(STORAGE_KEYS.holds), tenantId, verticalId);
  }
  getHold(tenantId: string, verticalId: string, holdId: string): ScheduleHold | null {
    return (
      this.read<ScheduleHold>(STORAGE_KEYS.holds).find(
        (row) =>
          row.tenantId === tenantId && row.verticalId === verticalId && row.holdId === holdId,
      ) ?? null
    );
  }
  saveHold(hold: ScheduleHold): void {
    this.replace(
      STORAGE_KEYS.holds,
      hold,
      (row) =>
        row.holdId === hold.holdId &&
        row.tenantId === hold.tenantId &&
        row.verticalId === hold.verticalId,
    );
  }
  listBookings(tenantId: string, verticalId: string): ScheduledBooking[] {
    return scoped(this.read<ScheduledBooking>(STORAGE_KEYS.bookings), tenantId, verticalId);
  }
  getBooking(tenantId: string, verticalId: string, bookingId: string): ScheduledBooking | null {
    return (
      this.read<ScheduledBooking>(STORAGE_KEYS.bookings).find(
        (row) =>
          row.tenantId === tenantId && row.verticalId === verticalId && row.bookingId === bookingId,
      ) ?? null
    );
  }
  saveBooking(booking: ScheduledBooking): void {
    this.replace(
      STORAGE_KEYS.bookings,
      booking,
      (row) =>
        row.bookingId === booking.bookingId &&
        row.tenantId === booking.tenantId &&
        row.verticalId === booking.verticalId,
    );
  }
  listReservations(tenantId: string, verticalId: string): ScheduleReservation[] {
    const bookings = this.listBookings(tenantId, verticalId)
      .filter((booking) => booking.state !== "CANCELLED" && booking.state !== "EXPIRED")
      .map((booking): ScheduleReservation => ({
        reservationId: `booking:${booking.bookingId}`,
        tenantId: booking.tenantId,
        verticalId: booking.verticalId,
        workerId: booking.workerId,
        kind: "booking",
        serviceRequestId: booking.serviceRequestId,
        bookingId: booking.bookingId,
        holdId: booking.holdId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        occupancyStartAt: booking.occupancyStartAt,
        occupancyEndAt: booking.occupancyEndAt,
        status: "confirmed",
      }));
    return [
      ...bookings,
      ...this.listHolds(tenantId, verticalId)
        .filter((hold) => hold.status === "active")
        .map((hold): ScheduleReservation => ({
          reservationId: hold.reservationId,
          tenantId: hold.tenantId,
          verticalId: hold.verticalId,
          workerId: hold.workerId,
          kind: "hold",
          serviceRequestId: hold.serviceRequestId,
          holdId: hold.holdId,
          startAt: hold.startAt,
          endAt: hold.endAt,
          occupancyStartAt: hold.occupancyStartAt,
          occupancyEndAt: hold.occupancyEndAt,
          status: "held",
          expiresAt: hold.expiresAt,
        })),
    ];
  }
  listJobs(tenantId: string, verticalId: string): JobRecord[] {
    return scoped(this.read<JobRecord>(STORAGE_KEYS.jobs), tenantId, verticalId);
  }
  getJob(tenantId: string, verticalId: string, jobId: string): JobRecord | null {
    return (
      this.read<JobRecord>(STORAGE_KEYS.jobs).find(
        (row) => row.tenantId === tenantId && row.verticalId === verticalId && row.jobId === jobId,
      ) ?? null
    );
  }
  saveJob(job: JobRecord): void {
    this.replace(
      STORAGE_KEYS.jobs,
      job,
      (row) =>
        row.jobId === job.jobId &&
        row.tenantId === job.tenantId &&
        row.verticalId === job.verticalId,
    );
  }
  getJobConversation(
    tenantId: string,
    verticalId: string,
    conversationId: string,
  ): JobConversation | null {
    return (
      this.read<JobConversation>(STORAGE_KEYS.jobConversations).find(
        (row) =>
          row.tenantId === tenantId &&
          row.verticalId === verticalId &&
          row.conversationId === conversationId,
      ) ?? null
    );
  }
  saveJobConversation(conversation: JobConversation): void {
    this.replace(
      STORAGE_KEYS.jobConversations,
      conversation,
      (row) =>
        row.conversationId === conversation.conversationId &&
        row.tenantId === conversation.tenantId &&
        row.verticalId === conversation.verticalId,
    );
  }
  listNotificationIntents(
    tenantId: string,
    verticalId: string,
    jobId?: string,
  ): NotificationIntent[] {
    return scoped(
      this.read<NotificationIntent>(STORAGE_KEYS.notificationIntents),
      tenantId,
      verticalId,
    ).filter((row) => !jobId || row.jobId === jobId);
  }
  saveNotificationIntent(intent: NotificationIntent): void {
    this.replace(
      STORAGE_KEYS.notificationIntents,
      intent,
      (row) =>
        row.notificationId === intent.notificationId &&
        row.tenantId === intent.tenantId &&
        row.verticalId === intent.verticalId,
    );
  }
  appendSchedulingAudit(event: SchedulingAuditEvent): void {
    const rows = this.read<SchedulingAuditEvent>(STORAGE_KEYS.schedulingAudit);
    rows.push(clone(event));
    this.write(STORAGE_KEYS.schedulingAudit, rows);
  }
  listSchedulingAudit(tenantId: string, verticalId: string): SchedulingAuditEvent[] {
    return scoped(
      this.read<SchedulingAuditEvent>(STORAGE_KEYS.schedulingAudit),
      tenantId,
      verticalId,
    );
  }
  getContext(tenantId: string, contextId: string): PrivacyContext | null {
    return (
      this.read<PrivacyContext>(STORAGE_KEYS.privacyContexts).find(
        (row) => row.tenantId === tenantId && row.contextId === contextId,
      ) ?? null
    );
  }
  saveContext(context: PrivacyContext): void {
    this.replace(
      STORAGE_KEYS.privacyContexts,
      context,
      (row) =>
        row.contextId === context.contextId &&
        row.tenantId === context.tenantId &&
        row.verticalId === context.verticalId,
    );
  }
  updateContext(
    tenantId: string,
    contextId: string,
    patch: Partial<PrivacyContext>,
  ): PrivacyContext | null {
    const rows = this.read<PrivacyContext>(STORAGE_KEYS.privacyContexts);
    const index = rows.findIndex((row) => row.tenantId === tenantId && row.contextId === contextId);
    if (index < 0) return null;
    rows[index] = { ...rows[index]!, ...clone(patch) };
    this.write(STORAGE_KEYS.privacyContexts, rows);
    return clone(rows[index]!);
  }
  getConsent(
    tenantId: string,
    verticalId: string,
    contextId: string,
    capability: PrivacyConsentRecord["capability"],
    purpose: string,
  ): PrivacyConsentRecord | null {
    return (
      this.read<PrivacyConsentRecord>(STORAGE_KEYS.privacyConsents).find(
        (row) =>
          row.tenantId === tenantId &&
          row.verticalId === verticalId &&
          row.contextId === contextId &&
          row.capability === capability &&
          row.purpose === purpose,
      ) ?? null
    );
  }
  saveConsent(consent: PrivacyConsentRecord): void {
    this.replace(
      STORAGE_KEYS.privacyConsents,
      consent,
      (row) =>
        row.consentId === consent.consentId &&
        row.tenantId === consent.tenantId &&
        row.verticalId === consent.verticalId,
    );
  }
  appendAudit(event: PrivacyAuditEvent): void {
    const rows = this.read<PrivacyAuditEvent>(STORAGE_KEYS.privacyAudit);
    rows.push(clone(event));
    this.write(STORAGE_KEYS.privacyAudit, rows);
  }
  listAudit(tenantId: string, verticalId: string, contextId?: string): PrivacyAuditEvent[] {
    return this.read<PrivacyAuditEvent>(STORAGE_KEYS.privacyAudit)
      .filter(
        (event) =>
          event.tenantId === tenantId &&
          event.verticalId === verticalId &&
          (!contextId || event.contextId === contextId),
      )
      .map(clone);
  }
  withTransaction<T>(_tenantId: string, _verticalId: string, action: () => T): T {
    const snapshot = Object.fromEntries(
      Object.values(STORAGE_KEYS).map((key) => [
        key,
        typeof window === "undefined" ? null : window.localStorage.getItem(key),
      ]),
    );
    try {
      return action();
    } catch (error) {
      if (typeof window !== "undefined")
        for (const [key, value] of Object.entries(snapshot)) {
          if (value === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, value);
        }
      throw error;
    }
  }
}

export const browserSchedulingRepository = new BrowserSchedulingRepository();
