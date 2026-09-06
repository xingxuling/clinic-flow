import type { MessagingAdapter, ChannelSendReceipt } from "@/integrations/messaging-adapter";
import type { Appointment, Clinic, Patient, Staff } from "@/types/domain";

export interface AppointmentReminderView {
  text: string;
  appointmentId: string;
  replyOptions: {
    id: string;
    label: string;
    payload: string;
  }[];
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/**
 * 只生成预约行政资料，不放病历、诊断、治疗内容。
 */
export function buildAppointmentReminder(input: {
  clinic: Clinic;
  patient: Patient;
  appointment: Appointment;
  practitioner: Staff;
  serviceName: string;
}): AppointmentReminderView {
  const when = formatDateTime(input.appointment.startAt);
  const text = [
    `${input.patient.name}你好，提提你：`,
    `${when} 有一個「${input.serviceName}」預約。`,
    `負責：${input.practitioner.name}。`,
    "你可以直接按下面按鈕確認、改期或取消。接近應診時間的改動可能需要診所職員確認。",
  ].join("\n");

  return {
    text,
    appointmentId: input.appointment.id,
    replyOptions: [
      {
        id: `confirm_${input.appointment.id}`,
        label: "確認",
        payload: `appointment:confirm:${input.appointment.id}`,
      },
      {
        id: `reschedule_${input.appointment.id}`,
        label: "改期",
        payload: `appointment:reschedule:${input.appointment.id}`,
      },
      {
        id: `cancel_${input.appointment.id}`,
        label: "取消",
        payload: `appointment:cancel:${input.appointment.id}`,
      },
    ],
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
