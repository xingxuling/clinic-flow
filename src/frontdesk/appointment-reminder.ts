import { buildBookingReminder } from "@/frontdesk/booking-reminder";
import type { MessagingAdapter, ChannelSendReceipt } from "@/integrations/messaging-adapter";
import type { Appointment, Clinic, Patient, Staff } from "@/types/domain";
import { dentalVerticalPack } from "@/verticals/dental";

export interface AppointmentReminderView {
  text: string;
  appointmentId: string;
  replyOptions: {
    id: string;
    label: string;
    payload: string;
  }[];
}

/**
 * 牙科兼容包装器。实际提醒文案与按钮由通用 buildBookingReminder 生成。
 */
export function buildAppointmentReminder(input: {
  clinic: Clinic;
  patient: Patient;
  appointment: Appointment;
  practitioner: Staff;
  serviceName: string;
}): AppointmentReminderView {
  const reminder = buildBookingReminder({
    vertical: dentalVerticalPack,
    timezone: input.clinic.timezone,
    customerName: input.patient.name,
    bookingId: input.appointment.id,
    startAt: input.appointment.startAt,
    serviceName: input.serviceName,
    resourceName: input.practitioner.name,
  });

  return {
    text: reminder.text,
    appointmentId: reminder.bookingId,
    replyOptions: reminder.replyOptions,
  };
}

export async function sendAppointmentReminder(input: {
  adapter: MessagingAdapter;
  clinic: Clinic;
  patient: Patient;
  appointment: Appointment;
  practitioner: Staff;
  serviceName: string;
  correlationId: string;
}): Promise<ChannelSendReceipt> {
  const reminder = buildAppointmentReminder(input);
  return input.adapter.send({
    clinicId: input.clinic.id,
    patientId: input.patient.id,
    channel: input.adapter.channel,
    text: reminder.text,
    replyOptions: reminder.replyOptions,
    correlationId: input.correlationId,
  });
}
