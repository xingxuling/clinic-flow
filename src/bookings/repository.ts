import type { NewServiceBookingInput, ServiceBooking } from "@/bookings/types";

export interface ServiceBookingRepository {
  list(tenantId: string, verticalId: string): ServiceBooking[];
  get(tenantId: string, bookingId: string): ServiceBooking | null;
  add(input: NewServiceBookingInput): ServiceBooking;
  update(tenantId: string, bookingId: string, patch: Partial<ServiceBooking>): ServiceBooking | null;
}

const STORAGE_KEY = "service-frontdesk.bookings.v1";
export const SERVICE_BOOKINGS_CHANGED_EVENT = "service-frontdesk:bookings-changed";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `bk_${crypto.randomUUID()}`;
  return `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function validIso(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export class BrowserServiceBookingRepository implements ServiceBookingRepository {
  private readAll(): ServiceBooking[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((row): row is ServiceBooking => {
        if (!row || typeof row !== "object") return false;
        const value = row as Partial<ServiceBooking>;
        return Boolean(
          typeof value.id === "string" &&
            typeof value.tenantId === "string" &&
            typeof value.verticalId === "string" &&
            typeof value.customerId === "string" &&
            typeof value.resourceId === "string" &&
            typeof value.serviceId === "string" &&
            typeof value.startAt === "string" &&
            typeof value.endAt === "string",
        );
      });
    } catch {
      return [];
    }
  }

  private writeAll(rows: ServiceBooking[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(SERVICE_BOOKINGS_CHANGED_EVENT));
  }

  list(tenantId: string, verticalId: string): ServiceBooking[] {
    return clone(
      this.readAll()
        .filter((row) => row.tenantId === tenantId && row.verticalId === verticalId)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    );
  }

  get(tenantId: string, bookingId: string): ServiceBooking | null {
    const row = this.readAll().find((item) => item.tenantId === tenantId && item.id === bookingId);
    return row ? clone(row) : null;
  }

  add(input: NewServiceBookingInput): ServiceBooking {
    if (!input.tenantId.trim()) throw new Error("BOOKING_TENANT_REQUIRED");
    if (!input.verticalId.trim()) throw new Error("BOOKING_VERTICAL_REQUIRED");
    if (!input.customerId.trim()) throw new Error("BOOKING_CUSTOMER_REQUIRED");
    if (!input.resourceId.trim()) throw new Error("BOOKING_RESOURCE_REQUIRED");
    if (!input.serviceId.trim()) throw new Error("BOOKING_SERVICE_REQUIRED");
    if (!validIso(input.startAt)) throw new Error("BOOKING_START_INVALID");
    if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) throw new Error("BOOKING_DURATION_INVALID");

    const start = new Date(input.startAt);
    const end = new Date(start.getTime() + input.durationMin * 60_000);
    const now = new Date().toISOString();
    const booking: ServiceBooking = {
      id: makeId(),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      customerId: input.customerId,
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: "pending",
      venue: input.venue,
      note: input.note ?? "",
      source: input.source,
      ...(input.createdBy ? { createdBy: clone(input.createdBy) } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const rows = this.readAll();
    rows.push(booking);
    this.writeAll(rows);
    return clone(booking);
  }

  update(tenantId: string, bookingId: string, patch: Partial<ServiceBooking>): ServiceBooking | null {
    const rows = this.readAll();
    const index = rows.findIndex((row) => row.tenantId === tenantId && row.id === bookingId);
    if (index < 0) return null;

    const current = rows[index]!;
    rows[index] = {
      ...current,
      ...clone(patch),
      id: current.id,
      tenantId: current.tenantId,
      verticalId: current.verticalId,
      customerId: current.customerId,
      updatedAt: new Date().toISOString(),
    };
    this.writeAll(rows);
    return clone(rows[index]!);
  }
}

export const serviceBookingRepository = new BrowserServiceBookingRepository();
