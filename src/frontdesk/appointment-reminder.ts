import { buildBookingReminder } from "@/frontdesk/booking-reminder";
import type {
  MessagingAdapter,
  ChannelSendReceipt,
  WhatsAppTemplateRef,
} from "@/integrations/messaging-adapter";
import { messagingAutomationControlRepository } from "@/messaging/automation-control";
import { evaluateWhatsAppPolicy } from "@/messaging/whatsapp-policy";
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

/**
 * Legacy reminder sender kept only for compatibility.
 * It no longer bypasses WhatsApp opt-in / Agent stop / 24h / template policy.
 */
export async function sendAppointmentReminder(input: {
  adapter: MessagingAdapter;
  clinic: Clinic;
  patient: Patient;
  appointment: Appointment;
  practitioner: Staff;
  serviceName: string;
  correlationId: string;
  production?: boolean;
  whatsappTemplate?: WhatsAppTemplateRef;
}): Promise<ChannelSendReceipt> {
  const reminder = buildAppointmentReminder(input);

  if (input.adapter.channel === "whatsapp") {
    const tenantControl = messagingAutomationControlRepository.getTenant(input.clinic.id);
    const customerControl = messagingAutomationControlRepository.getCustomer(
      input.clinic.id,
      "dental",
      input.patient.id,
    );
    const policy = evaluateWhatsAppPolicy({
      tenantId: input.clinic.id,
      adapter: input.adapter,
      production: Boolean(input.production),
      actor: "agent",
      initiation: "business_initiated",
      tenantControl,
      customerControl,
      purpose: "utility",
      ...(input.whatsappTemplate ? { template: input.whatsappTemplate } : {}),
    });
    if (!policy.allowed) {
      return {
        ok: false,
        providerMessageId: null,
        providerId: input.adapter.providerId,
        errorCode: policy.blockCode ?? "WHATSAPP_POLICY_BLOCKED",
        sentAt: new Date().toISOString(),
      };
    }
  }

  return input.adapter.send({
    clinicId: input.clinic.id,
    patientId: input.patient.id,
    recipientPhone: input.patient.phone,
    channel: input.adapter.channel,
    text: reminder.text,
    replyOptions: reminder.replyOptions,
    correlationId: input.correlationId,
    ...(input.whatsappTemplate
      ? {
          whatsappTemplate: {
            ...input.whatsappTemplate,
            ...(input.whatsappTemplate.bodyParameters
              ? { bodyParameters: [...input.whatsappTemplate.bodyParameters] }
              : {}),
          },
        }
      : {}),
  });
}
