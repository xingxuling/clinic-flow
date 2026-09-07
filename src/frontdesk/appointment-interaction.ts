import { parseBookingInteractionPayload } from "@/frontdesk/booking-interaction";
import type { ID } from "@/types/domain";

export type AppointmentInteraction =
  | { kind: "confirm"; appointmentId: ID }
  | { kind: "cancel"; appointmentId: ID }
  | { kind: "reschedule_request"; appointmentId: ID }
  | { kind: "reschedule_select"; appointmentId: ID; startAt: string };

const ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * 牙科旧协议继续发出 `appointment:*`，避免破坏已存在的 Demo 链接。
 * 新通用行业使用 `booking:*`。
 */
export function appointmentInteractionPayload(
  interaction: AppointmentInteraction,
): string {
  if (!ID_PATTERN.test(interaction.appointmentId)) {
    throw new Error("APPOINTMENT_ID_INVALID");
  }

  if (interaction.kind === "confirm") {
    return `appointment:confirm:${interaction.appointmentId}`;
  }
  if (interaction.kind === "cancel") {
    return `appointment:cancel:${interaction.appointmentId}`;
  }
  if (interaction.kind === "reschedule_request") {
    return `appointment:reschedule:${interaction.appointmentId}`;
  }

  const epochMs = new Date(interaction.startAt).getTime();
  if (!Number.isFinite(epochMs)) throw new Error("RESCHEDULE_TIME_INVALID");
  return `appointment:slot:${interaction.appointmentId}:${epochMs}`;
}

/**
 * 兼容解析器同时接受旧 `appointment:*` 与新 `booking:*` payload。
 */
export function parseAppointmentInteractionPayload(
  payload: string,
): AppointmentInteraction | null {
  const parsed = parseBookingInteractionPayload(payload);
  if (!parsed) return null;

  if (parsed.kind === "confirm") {
    return { kind: "confirm", appointmentId: parsed.bookingId };
  }
  if (parsed.kind === "cancel") {
    return { kind: "cancel", appointmentId: parsed.bookingId };
  }
  if (parsed.kind === "reschedule_request") {
    return { kind: "reschedule_request", appointmentId: parsed.bookingId };
  }
  return {
    kind: "reschedule_select",
    appointmentId: parsed.bookingId,
    startAt: parsed.startAt,
  };
}
