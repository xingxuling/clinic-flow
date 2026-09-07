import type { ActorRef, Appointment, AppointmentStatus } from "@/types/domain";
import { entityVerticalId } from "@/verticals/entity-scope";

export type ServiceBookingStatus = AppointmentStatus;

export interface ServiceBooking {
  id: string;
  tenantId: string;
  verticalId: string;
  customerId: string;
  subjectId?: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: ServiceBookingStatus;
  venue: string;
  note: string;
  source: "legacy_appointment_compat" | "manual" | "agent" | "integration";
  createdBy?: ActorRef;
  createdAt: string;
  updatedAt: string;
}

export interface NewServiceBookingInput {
  tenantId: string;
  verticalId: string;
  customerId: string;
  subjectId?: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  durationMin: number;
  venue: string;
  note?: string;
  source: ServiceBooking["source"];
  createdBy?: ActorRef;
}

/** 旧 Appointment 只作为 dental-first compatibility projection。 */
export function appointmentToServiceBooking(appointment: Appointment): ServiceBooking {
  return {
    id: appointment.id,
    tenantId: appointment.clinicId,
    verticalId: entityVerticalId(appointment),
    customerId: appointment.patientId,
    resourceId: appointment.practitionerId,
    serviceId: appointment.serviceId,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    status: appointment.status,
    venue: appointment.room,
    note: appointment.note,
    source: "legacy_appointment_compat",
    createdBy: appointment.createdBy,
    createdAt: appointment.startAt,
    updatedAt: appointment.startAt,
  };
}
