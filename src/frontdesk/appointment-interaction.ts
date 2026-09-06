import type { ID } from "@/types/domain";

export type AppointmentInteraction =
  | { kind: "confirm"; appointmentId: ID }
  | { kind: "cancel"; appointmentId: ID }
  | { kind: "reschedule_request"; appointmentId: ID }
  | { kind: "reschedule_select"; appointmentId: ID; startAt: string };

const ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

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

export function parseAppointmentInteractionPayload(
  payload: string,
): AppointmentInteraction | null {
  const parts = payload.split(":");
  if (parts[0] !== "appointment") return null;

  const action = parts[1];
  const appointmentId = parts[2];
  if (!appointmentId || !ID_PATTERN.test(appointmentId)) return null;

  if (action === "confirm" && parts.length === 3) {
    return { kind: "confirm", appointmentId };
  }
  if (action === "cancel" && parts.length === 3) {
    return { kind: "cancel", appointmentId };
  }
  if (action === "reschedule" && parts.length === 3) {
    return { kind: "reschedule_request", appointmentId };
  }
  if (action === "slot" && parts.length === 4) {
    const epochMs = Number(parts[3]);
    if (!Number.isSafeInteger(epochMs) || epochMs <= 0) return null;
    return {
      kind: "reschedule_select",
      appointmentId,
      startAt: new Date(epochMs).toISOString(),
    };
  }
  return null;
}
