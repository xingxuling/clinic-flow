import type { ServiceRequestStatus } from "@/scheduling/types";

/**
 * The request lifecycle is deliberately explicit. A hold is not a booking and
 * customer confirmation is not silently treated as worker notification.
 */
export const SERVICE_REQUEST_TRANSITIONS: Record<
  ServiceRequestStatus,
  readonly ServiceRequestStatus[]
> = {
  DRAFT: ["MATCHING", "CANCELLED", "FAILED"],
  MATCHING: ["OFFERED", "EXPIRED", "FAILED", "CANCELLED"],
  OFFERED: ["HELD", "EXPIRED", "CANCELLED", "FAILED"],
  HELD: ["CUSTOMER_CONFIRMED", "EXPIRED", "CANCELLED", "FAILED"],
  CUSTOMER_CONFIRMED: ["WORKER_NOTIFIED", "FAILED"],
  WORKER_NOTIFIED: ["SCHEDULED", "FAILED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED", "RESCHEDULE_REQUIRED", "FAILED"],
  IN_PROGRESS: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: [],
  DECLINED: ["MATCHING", "CANCELLED"],
  RESCHEDULE_REQUIRED: ["MATCHING", "CANCELLED", "FAILED"],
  FAILED: ["MATCHING", "CANCELLED"],
};

export function canTransitionServiceRequest(
  from: ServiceRequestStatus,
  to: ServiceRequestStatus,
): boolean {
  return SERVICE_REQUEST_TRANSITIONS[from].includes(to);
}

export function assertServiceRequestTransition(
  from: ServiceRequestStatus,
  to: ServiceRequestStatus,
): void {
  if (!canTransitionServiceRequest(from, to)) {
    throw new Error(`INVALID_SERVICE_REQUEST_TRANSITION:${from}->${to}`);
  }
}

export function isTerminalServiceRequestStatus(status: ServiceRequestStatus): boolean {
  return SERVICE_REQUEST_TRANSITIONS[status].length === 0;
}
