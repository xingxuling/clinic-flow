import { canTransitionAppointment, type ClinicRepository } from "@/data/repository";
import type { Appointment, Clinic, ID, ServiceType } from "@/types/domain";

export interface AppointmentSlot {
  practitionerId: ID;
  startAt: string;
  endAt: string;
}

export interface AppointmentMutationResult {
  ok: boolean;
  code:
    | "OK"
    | "NOT_FOUND"
    | "TENANT_MISMATCH"
    | "INVALID_TRANSITION"
    | "SLOT_CONFLICT"
    | "INVALID_SLOT";
  appointment?: Appointment;
}

export interface AppointmentAdapterContext {
  clinicId: ID;
  actorId: ID;
}

export interface AppointmentSystemAdapter {
  readonly providerId: string;
  readonly displayName: string;

  getAppointment(ctx: AppointmentAdapterContext, appointmentId: ID): Promise<Appointment | null>;
  listPatientAppointments(ctx: AppointmentAdapterContext, patientId: ID): Promise<Appointment[]>;
  findAvailableSlots(input: {
    ctx: AppointmentAdapterContext;
    practitionerId: ID;
    serviceId: ID;
    from: string;
    days: number;
    maxResults: number;
  }): Promise<AppointmentSlot[]>;
  confirm(ctx: AppointmentAdapterContext, appointmentId: ID): Promise<AppointmentMutationResult>;
  reschedule(input: {
    ctx: AppointmentAdapterContext;
    appointmentId: ID;
    startAt: string;
  }): Promise<AppointmentMutationResult>;
  cancel(ctx: AppointmentAdapterContext, appointmentId: ID): Promise<AppointmentMutationResult>;
}

function serviceById(clinic: Clinic, serviceId: ID): ServiceType | null {
  return clinic.services.find((service) => service.id === serviceId) ?? null;
}

function endAt(startAt: string, durationMin: number): string {
  return new Date(new Date(startAt).getTime() + durationMin * 60_000).toISOString();
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

function hasConflict(input: {
  appointments: Appointment[];
  practitionerId: ID;
  startAt: string;
  endAt: string;
  ignoreAppointmentId?: ID;
}): boolean {
  return input.appointments.some((appointment) => {
    if (appointment.id === input.ignoreAppointmentId) return false;
    if (appointment.practitionerId !== input.practitionerId) return false;
    if (appointment.status === "cancelled" || appointment.status === "no_show") return false;
    return overlaps(input.startAt, input.endAt, appointment.startAt, appointment.endAt);
  });
}

/**
 * Demo / 本地资料库适配器。
 *
 * 上层只依赖 AppointmentSystemAdapter；未来接 DCMS、DentoEase、ClinicSolution、
 * Google Calendar 或人工桥接时，替换适配器即可，不改 Agent 编排逻辑。
 */
export class RepositoryAppointmentAdapter implements AppointmentSystemAdapter {
  readonly providerId = "clinic-flow.repository";
  readonly displayName = "Clinic Flow 演示预约资料库";

  constructor(
    private readonly repo: ClinicRepository,
    private readonly clinic: Clinic,
  ) {}

  async getAppointment(ctx: AppointmentAdapterContext, appointmentId: ID): Promise<Appointment | null> {
    return this.repo
      .listAppointments(ctx.clinicId)
      .find((appointment) => appointment.id === appointmentId) ?? null;
  }

  async listPatientAppointments(ctx: AppointmentAdapterContext, patientId: ID): Promise<Appointment[]> {
    return this.repo
      .listAppointments(ctx.clinicId)
      .filter((appointment) => appointment.patientId === patientId);
  }

  async findAvailableSlots(input: {
    ctx: AppointmentAdapterContext;
    practitionerId: ID;
    serviceId: ID;
    from: string;
    days: number;
    maxResults: number;
  }): Promise<AppointmentSlot[]> {
    if (input.ctx.clinicId !== this.clinic.id) return [];
    const service = serviceById(this.clinic, input.serviceId);
    if (!service) return [];

    const from = new Date(input.from);
    if (Number.isNaN(from.getTime())) return [];

    const appointments = this.repo.listAppointments(input.ctx.clinicId);
    const slots: AppointmentSlot[] = [];
    const days = Math.min(Math.max(input.days, 1), 31);
    const maxResults = Math.min(Math.max(input.maxResults, 1), 50);

    for (let offset = 0; offset < days && slots.length < maxResults; offset += 1) {
      const day = new Date(from);
      day.setDate(from.getDate() + offset);
      const weekday = day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const hours = this.clinic.businessHours.find((row) => row.weekday === weekday);
      if (!hours || hours.closed) continue;

      const [openHour, openMinute] = hours.open.split(":").map(Number);
      const [closeHour, closeMinute] = hours.close.split(":").map(Number);
      if (
        openHour === undefined ||
        openMinute === undefined ||
        closeHour === undefined ||
        closeMinute === undefined
      ) {
        continue;
      }

      const cursor = new Date(day);
      cursor.setHours(openHour, openMinute, 0, 0);
      const close = new Date(day);
      close.setHours(closeHour, closeMinute, 0, 0);

      while (cursor.getTime() + service.durationMin * 60_000 <= close.getTime()) {
        if (cursor.getTime() >= from.getTime()) {
          const startAt = cursor.toISOString();
          const slotEnd = endAt(startAt, service.durationMin);
          if (
            !hasConflict({
              appointments,
              practitionerId: input.practitionerId,
              startAt,
              endAt: slotEnd,
            })
          ) {
            slots.push({ practitionerId: input.practitionerId, startAt, endAt: slotEnd });
            if (slots.length >= maxResults) break;
          }
        }
        cursor.setMinutes(cursor.getMinutes() + 30);
      }
    }

    return slots;
  }

  async confirm(ctx: AppointmentAdapterContext, appointmentId: ID): Promise<AppointmentMutationResult> {
    const appointment = await this.getAppointment(ctx, appointmentId);
    if (!appointment) return { ok: false, code: "NOT_FOUND" };
    if (appointment.clinicId !== ctx.clinicId) return { ok: false, code: "TENANT_MISMATCH" };
    if (!canTransitionAppointment(appointment.status, "confirmed")) {
      return { ok: false, code: "INVALID_TRANSITION", appointment };
    }

    this.repo.updateAppointment(ctx.clinicId, appointment.id, { status: "confirmed" });
    return {
      ok: true,
      code: "OK",
      appointment: { ...appointment, status: "confirmed" },
    };
  }

  async reschedule(input: {
    ctx: AppointmentAdapterContext;
    appointmentId: ID;
    startAt: string;
  }): Promise<AppointmentMutationResult> {
    const appointment = await this.getAppointment(input.ctx, input.appointmentId);
    if (!appointment) return { ok: false, code: "NOT_FOUND" };
    if (appointment.clinicId !== input.ctx.clinicId) return { ok: false, code: "TENANT_MISMATCH" };

    const start = new Date(input.startAt);
    if (Number.isNaN(start.getTime())) return { ok: false, code: "INVALID_SLOT", appointment };

    const durationMs = new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime();
    const nextEndAt = new Date(start.getTime() + durationMs).toISOString();
    const appointments = this.repo.listAppointments(input.ctx.clinicId);
    if (
      hasConflict({
        appointments,
        practitionerId: appointment.practitionerId,
        startAt: input.startAt,
        endAt: nextEndAt,
        ignoreAppointmentId: appointment.id,
      })
    ) {
      return { ok: false, code: "SLOT_CONFLICT", appointment };
    }

    this.repo.updateAppointment(input.ctx.clinicId, appointment.id, {
      startAt: input.startAt,
      endAt: nextEndAt,
      status: "pending",
    });
    return {
      ok: true,
      code: "OK",
      appointment: {
        ...appointment,
        startAt: input.startAt,
        endAt: nextEndAt,
        status: "pending",
      },
    };
  }

  async cancel(ctx: AppointmentAdapterContext, appointmentId: ID): Promise<AppointmentMutationResult> {
    const appointment = await this.getAppointment(ctx, appointmentId);
    if (!appointment) return { ok: false, code: "NOT_FOUND" };
    if (appointment.clinicId !== ctx.clinicId) return { ok: false, code: "TENANT_MISMATCH" };
    if (!canTransitionAppointment(appointment.status, "cancelled")) {
      return { ok: false, code: "INVALID_TRANSITION", appointment };
    }

    this.repo.updateAppointment(ctx.clinicId, appointment.id, { status: "cancelled" });
    return {
      ok: true,
      code: "OK",
      appointment: { ...appointment, status: "cancelled" },
    };
  }
}
