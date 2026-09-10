import type { BookingState, ServiceRequestStatus } from "@/scheduling/types";

export const BOOKING_STATE_TRANSITIONS: Record<BookingState, BookingState[]> = {
  DRAFT: ["MATCHING", "CANCELLED", "FAILED"],
  MATCHING: ["OFFERED", "FAILED", "CANCELLED"],
  OFFERED: ["HELD", "DECLINED", "CANCELLED", "FAILED"],
  HELD: ["CUSTOMER_CONFIRMED", "EXPIRED", "CANCELLED", "FAILED"],
  CUSTOMER_CONFIRMED: ["WORKER_NOTIFIED", "FAILED", "CANCELLED"],
  WORKER_NOTIFIED: ["SCHEDULED", "FAILED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED", "RESCHEDULE_REQUIRED"],
  IN_PROGRESS: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: ["DRAFT", "MATCHING"],
  DECLINED: ["MATCHING", "CANCELLED"],
  RESCHEDULE_REQUIRED: ["MATCHING", "CANCELLED"],
  FAILED: ["MATCHING", "CANCELLED"],
};

export function canTransitionBooking(from: BookingState, to: BookingState): boolean {
  return BOOKING_STATE_TRANSITIONS[from].includes(to);
}

export function transitionBooking(from: BookingState, to: BookingState): BookingState {
  if (!canTransitionBooking(from, to)) throw new Error(`INVALID_BOOKING_TRANSITION:${from}->${to}`);
  return to;
}

export const SERVICE_REQUEST_STATUS_TO_BOOKING_STATE: Record<ServiceRequestStatus, BookingState> = {
  draft: "DRAFT",
  matching: "MATCHING",
  offered: "OFFERED",
  held: "HELD",
  customer_confirmed: "CUSTOMER_CONFIRMED",
  worker_notified: "WORKER_NOTIFIED",
  scheduled: "SCHEDULED",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
  declined: "DECLINED",
  reschedule_required: "RESCHEDULE_REQUIRED",
  failed: "FAILED",
};

export function serviceRequestStatusForBookingState(state: BookingState): ServiceRequestStatus {
  const entry = Object.entries(SERVICE_REQUEST_STATUS_TO_BOOKING_STATE).find(
    ([, value]) => value === state,
  );
  return (entry?.[0] ?? "failed") as ServiceRequestStatus;
}
