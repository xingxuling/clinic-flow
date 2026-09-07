export type BookingInteraction =
  | { kind: "confirm"; bookingId: string }
  | { kind: "cancel"; bookingId: string }
  | { kind: "reschedule_request"; bookingId: string }
  | { kind: "reschedule_select"; bookingId: string; startAt: string };

const ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * 新通用按钮协议。旧 `appointment:*` 协议继续由兼容解析器接受。
 */
export function bookingInteractionPayload(interaction: BookingInteraction): string {
  if (!ID_PATTERN.test(interaction.bookingId)) throw new Error("BOOKING_ID_INVALID");

  if (interaction.kind === "confirm") return `booking:confirm:${interaction.bookingId}`;
  if (interaction.kind === "cancel") return `booking:cancel:${interaction.bookingId}`;
  if (interaction.kind === "reschedule_request") return `booking:reschedule:${interaction.bookingId}`;

  const epochMs = new Date(interaction.startAt).getTime();
  if (!Number.isFinite(epochMs)) throw new Error("RESCHEDULE_TIME_INVALID");
  return `booking:slot:${interaction.bookingId}:${epochMs}`;
}

export function parseBookingInteractionPayload(payload: string): BookingInteraction | null {
  const parts = payload.split(":");
  if (parts[0] !== "booking" && parts[0] !== "appointment") return null;

  const action = parts[1];
  const bookingId = parts[2];
  if (!bookingId || !ID_PATTERN.test(bookingId)) return null;

  if (action === "confirm" && parts.length === 3) return { kind: "confirm", bookingId };
  if (action === "cancel" && parts.length === 3) return { kind: "cancel", bookingId };
  if (action === "reschedule" && parts.length === 3) {
    return { kind: "reschedule_request", bookingId };
  }
  if (action === "slot" && parts.length === 4) {
    const epochMs = Number(parts[3]);
    if (!Number.isSafeInteger(epochMs) || epochMs <= 0) return null;
    return {
      kind: "reschedule_select",
      bookingId,
      startAt: new Date(epochMs).toISOString(),
    };
  }
  return null;
}
