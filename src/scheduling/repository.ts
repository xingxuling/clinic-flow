import {
  assertServiceRequestTransition,
  canTransitionServiceRequest,
} from "@/scheduling/state-machine";
import type {
  ScheduleHold,
  ServiceRequest,
  ServiceRequestStatus,
  ServiceScheduleBooking,
  ServiceWorker,
} from "@/scheduling/types";

export type HoldMutationCode =
  | "OK"
  | "DUPLICATE"
  | "REQUEST_NOT_FOUND"
  | "WORKER_NOT_FOUND"
  | "TENANT_MISMATCH"
  | "VERTICAL_MISMATCH"
  | "HOLD_NOT_FOUND"
  | "HOLD_EXPIRED"
  | "HOLD_ALREADY_CONFIRMED"
  | "CONFIRMATION_FAILED"
  | "HOLD_CONFLICT"
  | "BOOKING_CONFLICT"
  | "INVALID_STATE";

export interface HoldMutationReceipt {
  ok: boolean;
  duplicate: boolean;
  code: HoldMutationCode;
  hold: ScheduleHold | null;
}

export interface ConfirmHoldReceipt {
  ok: boolean;
  duplicate: boolean;
  code: HoldMutationCode;
  hold: ScheduleHold | null;
  booking: ServiceScheduleBooking | null;
  request: ServiceRequest | null;
}

export interface SchedulingStore {
  workers: ServiceWorker[];
  requests: ServiceRequest[];
  holds: ScheduleHold[];
  bookings: ServiceScheduleBooking[];
}

export interface SchedulingRepository {
  listWorkers(tenantId: string, verticalId: string): ServiceWorker[];
  getWorker(tenantId: string, verticalId: string, workerId: string): ServiceWorker | null;
  upsertWorker(worker: ServiceWorker): ServiceWorker;
  listRequests(tenantId: string, verticalId: string): ServiceRequest[];
  getRequest(tenantId: string, verticalId: string, requestId: string): ServiceRequest | null;
  addRequest(request: ServiceRequest): ServiceRequest;
  updateRequest(
    tenantId: string,
    verticalId: string,
    requestId: string,
    patch: Partial<ServiceRequest>,
  ): ServiceRequest | null;
  listHolds(tenantId: string, verticalId: string): ScheduleHold[];
  getHold(tenantId: string, verticalId: string, holdId: string): ScheduleHold | null;
  createHold(input: {
    tenantId: string;
    verticalId: string;
    requestId: string;
    workerId: string;
    customerId: string;
    candidateId: string;
    serviceStartAt: string;
    serviceEndAt: string;
    reservedStartAt: string;
    reservedEndAt: string;
    expiresAt: string;
    idempotencyKey: string;
    now: string;
  }): HoldMutationReceipt;
  confirmHold(input: {
    tenantId: string;
    verticalId: string;
    holdId: string;
    idempotencyKey: string;
    now: string;
  }): ConfirmHoldReceipt;
  markConfirmationFailed(
    tenantId: string,
    verticalId: string,
    holdId: string,
    reason: string,
    now: string,
  ): ServiceScheduleBooking | null;
  markScheduled(
    tenantId: string,
    verticalId: string,
    bookingId: string,
    now: string,
  ): ServiceScheduleBooking | null;
  expireHolds(now: string): ScheduleHold[];
  listBookings(tenantId: string, verticalId: string): ServiceScheduleBooking[];
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

function validInstant(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
  );
}

function activeHold(hold: ScheduleHold): boolean {
  return hold.status === "ACTIVE";
}

function activeBooking(booking: ServiceScheduleBooking): boolean {
  return booking.status !== "CANCELLED" && booking.status !== "FAILED";
}

function emptyStore(): SchedulingStore {
  return { workers: [], requests: [], holds: [], bookings: [] };
}

export class InMemorySchedulingRepository implements SchedulingRepository {
  protected store: SchedulingStore;

  constructor(store: SchedulingStore = emptyStore()) {
    this.store = clone(store);
  }

  protected afterMutation(): void {}

  protected snapshot(): SchedulingStore {
    return clone(this.store);
  }

  protected replace(store: SchedulingStore): void {
    this.store = clone(store);
  }

  listWorkers(tenantId: string, verticalId: string): ServiceWorker[] {
    return clone(
      this.store.workers.filter(
        (worker) => worker.tenantId === tenantId && worker.verticalId === verticalId,
      ),
    );
  }

  getWorker(tenantId: string, verticalId: string, workerId: string): ServiceWorker | null {
    const worker = this.store.workers.find(
      (item) =>
        item.id === workerId && item.tenantId === tenantId && item.verticalId === verticalId,
    );
    return worker ? clone(worker) : null;
  }

  upsertWorker(worker: ServiceWorker): ServiceWorker {
    if (!worker.tenantId.trim()) throw new Error("WORKER_TENANT_REQUIRED");
    if (!worker.verticalId.trim()) throw new Error("WORKER_VERTICAL_REQUIRED");
    if (!worker.id.trim()) throw new Error("WORKER_ID_REQUIRED");
    const index = this.store.workers.findIndex(
      (item) =>
        item.id === worker.id &&
        item.tenantId === worker.tenantId &&
        item.verticalId === worker.verticalId,
    );
    if (index >= 0) this.store.workers[index] = clone(worker);
    else this.store.workers.push(clone(worker));
    this.afterMutation();
    return clone(worker);
  }

  listRequests(tenantId: string, verticalId: string): ServiceRequest[] {
    return clone(
      this.store.requests
        .filter((request) => request.tenantId === tenantId && request.verticalId === verticalId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  getRequest(tenantId: string, verticalId: string, requestId: string): ServiceRequest | null {
    const request = this.store.requests.find(
      (item) =>
        item.requestId === requestId &&
        item.tenantId === tenantId &&
        item.verticalId === verticalId,
    );
    return request ? clone(request) : null;
  }

  addRequest(request: ServiceRequest): ServiceRequest {
    if (!request.tenantId.trim()) throw new Error("REQUEST_TENANT_REQUIRED");
    if (!request.verticalId.trim()) throw new Error("REQUEST_VERTICAL_REQUIRED");
    if (!request.customerId.trim()) throw new Error("REQUEST_CUSTOMER_REQUIRED");
    if (!request.serviceType.trim()) throw new Error("REQUEST_SERVICE_REQUIRED");
    if (this.store.requests.some((item) => item.requestId === request.requestId)) {
      throw new Error("DUPLICATE_SERVICE_REQUEST");
    }
    this.store.requests.push(clone(request));
    this.afterMutation();
    return clone(request);
  }

  updateRequest(
    tenantId: string,
    verticalId: string,
    requestId: string,
    patch: Partial<ServiceRequest>,
  ): ServiceRequest | null {
    const index = this.store.requests.findIndex(
      (request) =>
        request.tenantId === tenantId &&
        request.verticalId === verticalId &&
        request.requestId === requestId,
    );
    if (index < 0) return null;
    const current = this.store.requests[index]!;
    if (patch.status && patch.status !== current.status) {
      assertServiceRequestTransition(current.status, patch.status);
    }
    const next: ServiceRequest = {
      ...current,
      ...clone(patch),
      requestId: current.requestId,
      tenantId: current.tenantId,
      verticalId: current.verticalId,
      customerId: current.customerId,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    this.store.requests[index] = next;
    this.afterMutation();
    return clone(next);
  }

  listHolds(tenantId: string, verticalId: string): ScheduleHold[] {
    this.expireHolds(new Date().toISOString());
    return clone(
      this.store.holds
        .filter((hold) => hold.tenantId === tenantId && hold.verticalId === verticalId)
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
    );
  }

  getHold(tenantId: string, verticalId: string, holdId: string): ScheduleHold | null {
    this.expireHolds(new Date().toISOString());
    const hold = this.store.holds.find(
      (item) =>
        item.holdId === holdId && item.tenantId === tenantId && item.verticalId === verticalId,
    );
    return hold ? clone(hold) : null;
  }

  createHold(input: {
    tenantId: string;
    verticalId: string;
    requestId: string;
    workerId: string;
    customerId: string;
    candidateId: string;
    serviceStartAt: string;
    serviceEndAt: string;
    reservedStartAt: string;
    reservedEndAt: string;
    expiresAt: string;
    idempotencyKey: string;
    now: string;
  }): HoldMutationReceipt {
    this.expireHolds(input.now);
    const duplicate = this.store.holds.find(
      (hold) =>
        hold.tenantId === input.tenantId &&
        hold.verticalId === input.verticalId &&
        hold.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) {
      return { ok: true, duplicate: true, code: "DUPLICATE", hold: clone(duplicate) };
    }

    const request = this.store.requests.find(
      (item) => item.requestId === input.requestId && item.tenantId === input.tenantId,
    );
    if (!request) return { ok: false, duplicate: false, code: "REQUEST_NOT_FOUND", hold: null };
    if (request.verticalId !== input.verticalId) {
      return { ok: false, duplicate: false, code: "VERTICAL_MISMATCH", hold: null };
    }
    if (request.customerId !== input.customerId) {
      return { ok: false, duplicate: false, code: "TENANT_MISMATCH", hold: null };
    }

    const worker = this.store.workers.find(
      (item) =>
        item.id === input.workerId &&
        item.tenantId === input.tenantId &&
        item.verticalId === input.verticalId,
    );
    if (!worker) return { ok: false, duplicate: false, code: "WORKER_NOT_FOUND", hold: null };
    if (request.status !== "OFFERED" && request.status !== "HELD") {
      return { ok: false, duplicate: false, code: "INVALID_STATE", hold: null };
    }
    if (request.status === "HELD" && request.currentHoldId) {
      const currentHold = this.store.holds.find(
        (hold) =>
          hold.holdId === request.currentHoldId &&
          hold.tenantId === input.tenantId &&
          hold.verticalId === input.verticalId,
      );
      if (currentHold?.status === "ACTIVE") {
        return { ok: false, duplicate: false, code: "HOLD_CONFLICT", hold: null };
      }
    }
    if (
      !validInstant(input.serviceStartAt) ||
      !validInstant(input.serviceEndAt) ||
      !validInstant(input.reservedStartAt) ||
      !validInstant(input.reservedEndAt) ||
      !validInstant(input.expiresAt) ||
      new Date(input.expiresAt) <= new Date(input.now)
    ) {
      return { ok: false, duplicate: false, code: "HOLD_EXPIRED", hold: null };
    }

    const conflict = this.store.holds.some(
      (hold) =>
        hold.tenantId === input.tenantId &&
        hold.verticalId === input.verticalId &&
        hold.workerId === input.workerId &&
        activeHold(hold) &&
        overlaps(
          hold.reservedStartAt,
          hold.reservedEndAt,
          input.reservedStartAt,
          input.reservedEndAt,
        ),
    );
    if (conflict) return { ok: false, duplicate: false, code: "HOLD_CONFLICT", hold: null };

    const bookingConflict = this.store.bookings.some(
      (booking) =>
        booking.tenantId === input.tenantId &&
        booking.verticalId === input.verticalId &&
        booking.workerId === input.workerId &&
        activeBooking(booking) &&
        overlaps(
          booking.reservedStartAt,
          booking.reservedEndAt,
          input.reservedStartAt,
          input.reservedEndAt,
        ),
    );
    if (bookingConflict) {
      return { ok: false, duplicate: false, code: "BOOKING_CONFLICT", hold: null };
    }

    const now = input.now;
    const hold: ScheduleHold = {
      holdId: makeId("hold"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      workerId: input.workerId,
      customerId: input.customerId,
      serviceRequestId: input.requestId,
      candidateId: input.candidateId,
      serviceStartAt: input.serviceStartAt,
      serviceEndAt: input.serviceEndAt,
      reservedStartAt: input.reservedStartAt,
      reservedEndAt: input.reservedEndAt,
      expiresAt: input.expiresAt,
      status: "ACTIVE",
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    this.store.holds.push(hold);
    if (request.status === "OFFERED") {
      request.status = "HELD";
      request.currentHoldId = hold.holdId;
      request.selectedCandidateId = hold.candidateId;
      request.updatedAt = now;
    } else {
      request.currentHoldId = hold.holdId;
      request.selectedCandidateId = hold.candidateId;
      request.updatedAt = now;
    }
    this.afterMutation();
    return { ok: true, duplicate: false, code: "OK", hold: clone(hold) };
  }

  confirmHold(input: {
    tenantId: string;
    verticalId: string;
    holdId: string;
    idempotencyKey: string;
    now: string;
  }): ConfirmHoldReceipt {
    this.expireHolds(input.now);
    const existingByIdempotency = this.store.bookings.find(
      (booking) =>
        booking.tenantId === input.tenantId &&
        booking.verticalId === input.verticalId &&
        booking.confirmationIdempotencyKey === input.idempotencyKey,
    );
    if (existingByIdempotency) {
      if (existingByIdempotency.status === "FAILED") {
        return {
          ok: false,
          duplicate: true,
          code: "CONFIRMATION_FAILED",
          hold: null,
          booking: clone(existingByIdempotency),
          request: this.getRequest(
            input.tenantId,
            input.verticalId,
            existingByIdempotency.serviceRequestId,
          ),
        };
      }
      const existingHold = this.store.holds.find(
        (hold) =>
          hold.holdId === existingByIdempotency.holdId &&
          hold.tenantId === input.tenantId &&
          hold.verticalId === input.verticalId,
      );
      return {
        ok: true,
        duplicate: true,
        code: "DUPLICATE",
        hold: existingHold ? clone(existingHold) : null,
        booking: clone(existingByIdempotency),
        request: this.getRequest(
          input.tenantId,
          input.verticalId,
          existingByIdempotency.serviceRequestId,
        ),
      };
    }
    const holdIndex = this.store.holds.findIndex(
      (item) =>
        item.holdId === input.holdId &&
        item.tenantId === input.tenantId &&
        item.verticalId === input.verticalId,
    );
    if (holdIndex < 0) {
      return {
        ok: false,
        duplicate: false,
        code: "HOLD_NOT_FOUND",
        hold: null,
        booking: null,
        request: null,
      };
    }
    const hold = this.store.holds[holdIndex]!;
    const existingBooking = this.store.bookings.find(
      (booking) =>
        booking.holdId === hold.holdId &&
        booking.tenantId === input.tenantId &&
        booking.verticalId === input.verticalId,
    );
    if (hold.status === "CONFIRMED" && existingBooking) {
      return {
        ok: true,
        duplicate: true,
        code: "DUPLICATE",
        hold: clone(hold),
        booking: clone(existingBooking),
        request: this.getRequest(input.tenantId, input.verticalId, hold.serviceRequestId),
      };
    }
    if (hold.status !== "ACTIVE") {
      return {
        ok: false,
        duplicate: false,
        code: hold.status === "EXPIRED" ? "HOLD_EXPIRED" : "HOLD_ALREADY_CONFIRMED",
        hold: clone(hold),
        booking: existingBooking ? clone(existingBooking) : null,
        request: this.getRequest(input.tenantId, input.verticalId, hold.serviceRequestId),
      };
    }
    if (new Date(hold.expiresAt) <= new Date(input.now)) {
      hold.status = "EXPIRED";
      hold.updatedAt = input.now;
      this.afterMutation();
      return {
        ok: false,
        duplicate: false,
        code: "HOLD_EXPIRED",
        hold: clone(hold),
        booking: null,
        request: this.getRequest(input.tenantId, input.verticalId, hold.serviceRequestId),
      };
    }

    const requestIndex = this.store.requests.findIndex(
      (request) =>
        request.requestId === hold.serviceRequestId &&
        request.tenantId === input.tenantId &&
        request.verticalId === input.verticalId,
    );
    if (requestIndex < 0) {
      return {
        ok: false,
        duplicate: false,
        code: "REQUEST_NOT_FOUND",
        hold: clone(hold),
        booking: null,
        request: null,
      };
    }
    const request = this.store.requests[requestIndex]!;
    if (request.status !== "HELD") {
      return {
        ok: false,
        duplicate: false,
        code: "INVALID_STATE",
        hold: clone(hold),
        booking: null,
        request: clone(request),
      };
    }

    const conflict = this.store.bookings.some(
      (booking) =>
        booking.tenantId === input.tenantId &&
        booking.verticalId === input.verticalId &&
        booking.workerId === hold.workerId &&
        activeBooking(booking) &&
        overlaps(
          booking.reservedStartAt,
          booking.reservedEndAt,
          hold.reservedStartAt,
          hold.reservedEndAt,
        ),
    );
    if (conflict) {
      return {
        ok: false,
        duplicate: false,
        code: "BOOKING_CONFLICT",
        hold: clone(hold),
        booking: null,
        request: clone(request),
      };
    }

    const now = input.now;
    const booking: ServiceScheduleBooking = {
      bookingId: makeId("sbk"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      workerId: hold.workerId,
      customerId: hold.customerId,
      serviceRequestId: hold.serviceRequestId,
      holdId: hold.holdId,
      serviceStartAt: hold.serviceStartAt,
      serviceEndAt: hold.serviceEndAt,
      reservedStartAt: hold.reservedStartAt,
      reservedEndAt: hold.reservedEndAt,
      status: "SCHEDULED",
      confirmationIdempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    hold.status = "CONFIRMED";
    hold.updatedAt = now;
    request.status = "CUSTOMER_CONFIRMED";
    request.updatedAt = now;
    this.store.bookings.push(booking);
    this.afterMutation();
    return {
      ok: true,
      duplicate: false,
      code: "OK",
      hold: clone(hold),
      booking: clone(booking),
      request: clone(request),
    };
  }

  markConfirmationFailed(
    tenantId: string,
    verticalId: string,
    holdId: string,
    reason: string,
    now: string,
  ): ServiceScheduleBooking | null {
    const hold = this.store.holds.find(
      (item) =>
        item.holdId === holdId && item.tenantId === tenantId && item.verticalId === verticalId,
    );
    const booking = this.store.bookings.find(
      (item) =>
        item.holdId === holdId && item.tenantId === tenantId && item.verticalId === verticalId,
    );
    if (!hold || !booking) return null;
    booking.status = "FAILED";
    booking.failureReason = reason;
    booking.updatedAt = now;
    hold.status = "RELEASED";
    hold.updatedAt = now;
    const request = this.store.requests.find(
      (item) =>
        item.requestId === hold.serviceRequestId &&
        item.tenantId === tenantId &&
        item.verticalId === verticalId,
    );
    if (request && canTransitionServiceRequest(request.status, "FAILED")) {
      request.status = "FAILED";
      request.updatedAt = now;
    }
    this.afterMutation();
    return clone(booking);
  }

  markScheduled(
    tenantId: string,
    verticalId: string,
    bookingId: string,
    now: string,
  ): ServiceScheduleBooking | null {
    const booking = this.store.bookings.find(
      (item) =>
        item.bookingId === bookingId &&
        item.tenantId === tenantId &&
        item.verticalId === verticalId,
    );
    if (!booking) return null;
    const request = this.store.requests.find(
      (item) =>
        item.requestId === booking.serviceRequestId &&
        item.tenantId === tenantId &&
        item.verticalId === verticalId,
    );
    if (request && request.status === "CUSTOMER_CONFIRMED") {
      request.status = "WORKER_NOTIFIED";
      request.updatedAt = now;
    }
    if (request && request.status === "WORKER_NOTIFIED") {
      request.status = "SCHEDULED";
      request.updatedAt = now;
    }
    booking.status = "SCHEDULED";
    booking.updatedAt = now;
    this.afterMutation();
    return clone(booking);
  }

  expireHolds(now: string): ScheduleHold[] {
    const expired: ScheduleHold[] = [];
    for (const hold of this.store.holds) {
      if (hold.status !== "ACTIVE" || new Date(hold.expiresAt) > new Date(now)) continue;
      hold.status = "EXPIRED";
      hold.updatedAt = now;
      expired.push(clone(hold));
      const request = this.store.requests.find(
        (item) =>
          item.requestId === hold.serviceRequestId &&
          item.tenantId === hold.tenantId &&
          item.verticalId === hold.verticalId,
      );
      if (request && request.status === "HELD" && request.currentHoldId === hold.holdId) {
        request.status = "EXPIRED";
        request.updatedAt = now;
      }
    }
    if (expired.length > 0) this.afterMutation();
    return expired;
  }

  listBookings(tenantId: string, verticalId: string): ServiceScheduleBooking[] {
    return clone(
      this.store.bookings
        .filter((booking) => booking.tenantId === tenantId && booking.verticalId === verticalId)
        .sort((a, b) => a.serviceStartAt.localeCompare(b.serviceStartAt)),
    );
  }
}

const STORAGE_KEY = "service-frontdesk.scheduling-core.v1";
export const SCHEDULING_CHANGED_EVENT = "service-frontdesk:scheduling-changed";

function readBrowserStore(): SchedulingStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<SchedulingStore>;
    return {
      workers: Array.isArray(parsed.workers) ? parsed.workers : [],
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      holds: Array.isArray(parsed.holds) ? parsed.holds : [],
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
    } as SchedulingStore;
  } catch {
    return emptyStore();
  }
}

export class BrowserSchedulingRepository extends InMemorySchedulingRepository {
  constructor() {
    super(readBrowserStore());
  }

  refresh(): void {
    this.replace(readBrowserStore());
  }

  protected override afterMutation(): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot()));
    window.dispatchEvent(new CustomEvent(SCHEDULING_CHANGED_EVENT));
  }
}

export const schedulingRepository = new BrowserSchedulingRepository();
