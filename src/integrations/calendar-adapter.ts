import type { Appointment, ID } from "@/types/domain";

export interface CalendarSyncContext {
  clinicId: ID;
  providerId: string;
}

export interface CalendarEventProjection {
  appointmentId: ID;
  clinicId: ID;
  title: string;
  startAt: string;
  endAt: string;
  status: Appointment["status"];
  practitionerId: ID;
  room: string;
}

export interface CalendarSyncReceipt {
  ok: boolean;
  operation: "create" | "update" | "delete" | "noop";
  externalEventId: string | null;
  providerId: string;
  errorCode: string | null;
  syncedAt: string;
}

export interface CalendarAdapter {
  readonly providerId: string;
  readonly displayName: string;
  upsertAppointment(
    ctx: CalendarSyncContext,
    appointment: Appointment,
  ): Promise<CalendarSyncReceipt>;
  removeAppointment(
    ctx: CalendarSyncContext,
    appointmentId: ID,
  ): Promise<CalendarSyncReceipt>;
}

/**
 * 第一阶段本地日历桥接器：验证同步语义与幂等性。
 * 未来可实现 Google Calendar、Outlook 或特定 CMS 日历适配器。
 */
export class MemoryCalendarAdapter implements CalendarAdapter {
  readonly providerId = "clinic-flow.calendar.memory";
  readonly displayName = "本地演示日历";

  private readonly events = new Map<ID, CalendarEventProjection>();
  private readonly externalIds = new Map<ID, string>();

  async upsertAppointment(
    ctx: CalendarSyncContext,
    appointment: Appointment,
  ): Promise<CalendarSyncReceipt> {
    const syncedAt = new Date().toISOString();
    if (appointment.clinicId !== ctx.clinicId) {
      return {
        ok: false,
        operation: "noop",
        externalEventId: null,
        providerId: this.providerId,
        errorCode: "TENANT_MISMATCH",
        syncedAt,
      };
    }

    if (appointment.status === "cancelled") {
      return this.removeAppointment(ctx, appointment.id);
    }

    const existed = this.events.has(appointment.id);
    const externalEventId =
      this.externalIds.get(appointment.id) ?? `calendar_demo_${appointment.id}`;
    this.externalIds.set(appointment.id, externalEventId);
    this.events.set(appointment.id, {
      appointmentId: appointment.id,
      clinicId: appointment.clinicId,
      title: `診所預約 ${appointment.id}`,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      practitionerId: appointment.practitionerId,
      room: appointment.room,
    });

    return {
      ok: true,
      operation: existed ? "update" : "create",
      externalEventId,
      providerId: this.providerId,
      errorCode: null,
      syncedAt,
    };
  }

  async removeAppointment(
    ctx: CalendarSyncContext,
    appointmentId: ID,
  ): Promise<CalendarSyncReceipt> {
    const syncedAt = new Date().toISOString();
    const event = this.events.get(appointmentId);
    if (event && event.clinicId !== ctx.clinicId) {
      return {
        ok: false,
        operation: "noop",
        externalEventId: null,
        providerId: this.providerId,
        errorCode: "TENANT_MISMATCH",
        syncedAt,
      };
    }

    const externalEventId = this.externalIds.get(appointmentId) ?? null;
    if (!event) {
      return {
        ok: true,
        operation: "noop",
        externalEventId,
        providerId: this.providerId,
        errorCode: null,
        syncedAt,
      };
    }

    this.events.delete(appointmentId);
    return {
      ok: true,
      operation: "delete",
      externalEventId,
      providerId: this.providerId,
      errorCode: null,
      syncedAt,
    };
  }

  snapshot(): CalendarEventProjection[] {
    return Array.from(this.events.values()).map((event) => ({ ...event }));
  }
}
