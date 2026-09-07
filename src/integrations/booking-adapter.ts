import type {
  AppointmentAdapterContext,
  AppointmentMutationResult,
  AppointmentSystemAdapter,
} from "@/integrations/appointment-adapter";

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

/**
 * Service Frontdesk Core 的稳定时段/预约接口。
 *
 * Booking 可以代表：
 * - 牙科 / 美容 / 宠物：到店预约；
 * - 汽车维修：入厂预约；
 * - 家居 / 水电：上门时段。
 */
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

function mutationFromAppointment(result: AppointmentMutationResult): BookingMutationResult {
  return {
    ok: result.ok,
    code: result.code,
    ...(result.appointment ? { booking: bookingFromAppointment(result.appointment) } : {}),
  };
}

/**
 * 兼容桥：让现有 Clinic Flow AppointmentSystemAdapter 立即成为通用 BookingSystemAdapter。
 * 不改旧牙科 Repository，也不要求其他行业复制 Appointment 类型。
 */
export class AppointmentBookingAdapter implements BookingSystemAdapter {
  readonly providerId: string;
  readonly displayName: string;

  constructor(private readonly appointmentAdapter: AppointmentSystemAdapter) {
    this.providerId = `${appointmentAdapter.providerId}.booking-bridge`;
    this.displayName = `${appointmentAdapter.displayName}（Booking Bridge）`;
  }

  async getBooking(ctx: BookingAdapterContext, bookingId: string): Promise<BookingRecord | null> {
    const appointment = await this.appointmentAdapter.getAppointment(
      appointmentContext(ctx),
      bookingId,
    );
    return appointment ? bookingFromAppointment(appointment) : null;
  }

  async listCustomerBookings(
    ctx: BookingAdapterContext,
    customerId: string,
  ): Promise<BookingRecord[]> {
    const rows = await this.appointmentAdapter.listPatientAppointments(
      appointmentContext(ctx),
      customerId,
    );
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
    return mutationFromAppointment(
      await this.appointmentAdapter.confirm(appointmentContext(ctx), bookingId),
    );
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
    return mutationFromAppointment(
      await this.appointmentAdapter.cancel(appointmentContext(ctx), bookingId),
    );
  }
}
