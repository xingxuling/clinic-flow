import {
  serviceBookingRepository,
  type ServiceBookingRepository,
} from "@/bookings/repository";
import type { ServiceBooking } from "@/bookings/types";
import type {
  AppointmentAdapterContext,
  AppointmentMutationResult,
  AppointmentSystemAdapter,
} from "@/integrations/appointment-adapter";
import type { ServiceVerticalPack } from "@/verticals/types";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled";

export interface BookingRecord {
  id: string;
  tenantId: string;
  customerId: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
}

export interface BookingSlot {
  resourceId: string;
  startAt: string;
  endAt: string;
}

export interface BookingAdapterContext {
  tenantId: string;
  actorId: string;
}

export type BookingMutationCode =
  | "OK"
  | "NOT_FOUND"
  | "TENANT_MISMATCH"
  | "INVALID_TRANSITION"
  | "SLOT_CONFLICT"
  | "INVALID_SLOT";

export interface BookingMutationResult {
  ok: boolean;
  code: BookingMutationCode;
  booking?: BookingRecord;
}

export interface BookingSystemAdapter {
  readonly providerId: string;
  readonly displayName: string;

  getBooking(ctx: BookingAdapterContext, bookingId: string): Promise<BookingRecord | null>;
  listCustomerBookings(ctx: BookingAdapterContext, customerId: string): Promise<BookingRecord[]>;
  findAvailableSlots(input: {
    ctx: BookingAdapterContext;
    resourceId: string;
    serviceId: string;
    from: string;
    days: number;
    maxResults: number;
  }): Promise<BookingSlot[]>;
  confirm(ctx: BookingAdapterContext, bookingId: string): Promise<BookingMutationResult>;
  reschedule(input: {
    ctx: BookingAdapterContext;
    bookingId: string;
    startAt: string;
  }): Promise<BookingMutationResult>;
  cancel(ctx: BookingAdapterContext, bookingId: string): Promise<BookingMutationResult>;
}

function appointmentContext(ctx: BookingAdapterContext): AppointmentAdapterContext {
  return { clinicId: ctx.tenantId, actorId: ctx.actorId };
}

function bookingStatus(status: "pending" | "confirmed" | "arrived" | "no_show" | "cancelled"): BookingStatus {
  return status === "arrived" ? "completed" : status;
}

function bookingFromAppointment(appointment: NonNullable<AppointmentMutationResult["appointment"]>): BookingRecord {
  return {
    id: appointment.id,
    tenantId: appointment.clinicId,
    customerId: appointment.patientId,
    resourceId: appointment.practitionerId,
    serviceId: appointment.serviceId,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: bookingStatus(appointment.status),
  };
}

function bookingFromService(booking: ServiceBooking): BookingRecord {
  return {
    id: booking.id,
    tenantId: booking.tenantId,
    customerId: booking.customerId,
    resourceId: booking.resourceId,
    serviceId: booking.serviceId,
    startAt: booking.startAt,
    endAt: booking.endAt,
    status: bookingStatus(booking.status),
  };
}

function mutationFromAppointment(result: AppointmentMutationResult): BookingMutationResult {
  return {
    ok: result.ok,
    code: result.code,
    ...(result.appointment ? { booking: bookingFromAppointment(result.appointment) } : {}),
  };
}

export class AppointmentBookingAdapter implements BookingSystemAdapter {
  readonly providerId: string;
  readonly displayName: string;

  constructor(private readonly appointmentAdapter: AppointmentSystemAdapter) {
    this.providerId = `${appointmentAdapter.providerId}.booking-bridge`;
    this.displayName = `${appointmentAdapter.displayName}（Booking Bridge）`;
  }

  async getBooking(ctx: BookingAdapterContext, bookingId: string): Promise<BookingRecord | null> {
    const appointment = await this.appointmentAdapter.getAppointment(appointmentContext(ctx), bookingId);
    return appointment ? bookingFromAppointment(appointment) : null;
  }

  async listCustomerBookings(ctx: BookingAdapterContext, customerId: string): Promise<BookingRecord[]> {
    const rows = await this.appointmentAdapter.listPatientAppointments(appointmentContext(ctx), customerId);
    return rows.map(bookingFromAppointment);
  }

  async findAvailableSlots(input: {
    ctx: BookingAdapterContext;
    resourceId: string;
    serviceId: string;
    from: string;
    days: number;
    maxResults: number;
  }): Promise<BookingSlot[]> {
    const slots = await this.appointmentAdapter.findAvailableSlots({
      ctx: appointmentContext(input.ctx),
      practitionerId: input.resourceId,
      serviceId: input.serviceId,
      from: input.from,
      days: input.days,
      maxResults: input.maxResults,
    });
    return slots.map((slot) => ({
      resourceId: slot.practitionerId,
      startAt: slot.startAt,
      endAt: slot.endAt,
    }));
  }

  async confirm(ctx: BookingAdapterContext, bookingId: string): Promise<BookingMutationResult> {
    return mutationFromAppointment(await this.appointmentAdapter.confirm(appointmentContext(ctx), bookingId));
  }

  async reschedule(input: {
    ctx: BookingAdapterContext;
    bookingId: string;
    startAt: string;
  }): Promise<BookingMutationResult> {
    return mutationFromAppointment(
      await this.appointmentAdapter.reschedule({
        ctx: appointmentContext(input.ctx),
        appointmentId: input.bookingId,
        startAt: input.startAt,
      }),
    );
  }

  async cancel(ctx: BookingAdapterContext, bookingId: string): Promise<BookingMutationResult> {
    return mutationFromAppointment(await this.appointmentAdapter.cancel(appointmentContext(ctx), bookingId));
  }
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

/**
 * 新行业原生 Booking Adapter。
 * 浏览器 Demo 直接使用 ServiceBookingRepository；未来 PostgreSQL / CMS Adapter 只需实现同一接口。
 */
export class ServiceRepositoryBookingAdapter implements BookingSystemAdapter {
  readonly providerId: string;
  readonly displayName: string;

  constructor(
    private readonly vertical: ServiceVerticalPack,
    private readonly repository: ServiceBookingRepository = serviceBookingRepository,
    private readonly dayStartHour = 9,
    private readonly dayEndHour = 19,
  ) {
    this.providerId = `service-booking-repository.${vertical.id}`;
    this.displayName = `${vertical.displayName} Service Booking Repository`;
  }

  private scoped(ctx: BookingAdapterContext): ServiceBooking[] {
    return this.repository.list(ctx.tenantId, this.vertical.id);
  }

  private get(ctx: BookingAdapterContext, bookingId: string): ServiceBooking | null {
    const booking = this.repository.get(ctx.tenantId, bookingId);
    return booking?.verticalId === this.vertical.id ? booking : null;
  }

  async getBooking(ctx: BookingAdapterContext, bookingId: string): Promise<BookingRecord | null> {
    const booking = this.get(ctx, bookingId);
    return booking ? bookingFromService(booking) : null;
  }

  async listCustomerBookings(ctx: BookingAdapterContext, customerId: string): Promise<BookingRecord[]> {
    return this.scoped(ctx)
      .filter((booking) => booking.customerId === customerId)
      .map(bookingFromService);
  }

  async findAvailableSlots(input: {
    ctx: BookingAdapterContext;
    resourceId: string;
    serviceId: string;
    from: string;
    days: number;
    maxResults: number;
  }): Promise<BookingSlot[]> {
    const from = new Date(input.from);
    if (Number.isNaN(from.getTime()) || input.days <= 0 || input.maxResults <= 0) return [];
    const service = this.vertical.services.find((item) => item.id === input.serviceId);
    if (!service) return [];
    const durationMin = service.durationMin ?? 60;
    const existing = this.scoped(input.ctx).filter(
      (booking) => booking.resourceId === input.resourceId && booking.status !== "cancelled",
    );
    const slots: BookingSlot[] = [];

    for (let day = 0; day < input.days && slots.length < input.maxResults; day += 1) {
      const cursor = new Date(from);
      cursor.setDate(cursor.getDate() + day);
      cursor.setHours(this.dayStartHour, 0, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(this.dayEndHour, 0, 0, 0);

      while (cursor < dayEnd && slots.length < input.maxResults) {
        const start = new Date(cursor);
        const end = new Date(start.getTime() + durationMin * 60_000);
        if (end > dayEnd) break;
        if (start >= from) {
          const conflict = existing.some((booking) =>
            overlaps(start, end, new Date(booking.startAt), new Date(booking.endAt)),
          );
          if (!conflict) {
            slots.push({
              resourceId: input.resourceId,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
            });
          }
        }
        cursor.setMinutes(cursor.getMinutes() + 30);
      }
    }
    return slots;
  }

  async confirm(ctx: BookingAdapterContext, bookingId: string): Promise<BookingMutationResult> {
    const booking = this.get(ctx, bookingId);
    if (!booking) return { ok: false, code: "NOT_FOUND" };
    if (booking.status === "confirmed") return { ok: true, code: "OK", booking: bookingFromService(booking) };
    if (booking.status !== "pending") return { ok: false, code: "INVALID_TRANSITION", booking: bookingFromService(booking) };
    const updated = this.repository.update(ctx.tenantId, booking.id, { status: "confirmed" });
    return updated
      ? { ok: true, code: "OK", booking: bookingFromService(updated) }
      : { ok: false, code: "NOT_FOUND" };
  }

  async reschedule(input: {
    ctx: BookingAdapterContext;
    bookingId: string;
    startAt: string;
  }): Promise<BookingMutationResult> {
    const booking = this.get(input.ctx, input.bookingId);
    if (!booking) return { ok: false, code: "NOT_FOUND" };
    if (booking.status === "arrived" || booking.status === "cancelled") {
      return { ok: false, code: "INVALID_TRANSITION", booking: bookingFromService(booking) };
    }
    const start = new Date(input.startAt);
    if (Number.isNaN(start.getTime())) return { ok: false, code: "INVALID_SLOT", booking: bookingFromService(booking) };
    const duration = new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime();
    if (!Number.isFinite(duration) || duration <= 0) return { ok: false, code: "INVALID_SLOT", booking: bookingFromService(booking) };
    const end = new Date(start.getTime() + duration);

    const conflict = this.scoped(input.ctx).some(
      (row) =>
        row.id !== booking.id &&
        row.resourceId === booking.resourceId &&
        row.status !== "cancelled" &&
        overlaps(start, end, new Date(row.startAt), new Date(row.endAt)),
    );
    if (conflict) return { ok: false, code: "SLOT_CONFLICT", booking: bookingFromService(booking) };

    const updated = this.repository.update(input.ctx.tenantId, booking.id, {
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: "pending",
    });
    return updated
      ? { ok: true, code: "OK", booking: bookingFromService(updated) }
      : { ok: false, code: "NOT_FOUND" };
  }

  async cancel(ctx: BookingAdapterContext, bookingId: string): Promise<BookingMutationResult> {
    const booking = this.get(ctx, bookingId);
    if (!booking) return { ok: false, code: "NOT_FOUND" };
    if (booking.status === "cancelled") return { ok: true, code: "OK", booking: bookingFromService(booking) };
    if (booking.status === "arrived") return { ok: false, code: "INVALID_TRANSITION", booking: bookingFromService(booking) };
    const updated = this.repository.update(ctx.tenantId, booking.id, { status: "cancelled" });
    return updated
      ? { ok: true, code: "OK", booking: bookingFromService(updated) }
      : { ok: false, code: "NOT_FOUND" };
  }
}
