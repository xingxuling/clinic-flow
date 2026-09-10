import type { ServiceMessagePurpose, ServiceWorkItem } from "@/work-items/types";

export type SchedulingUrgency = "flexible" | "normal" | "urgent" | "emergency";
export type WorkerStatus = "active" | "inactive" | "on_leave";
export type ServiceRequestStatus =
  | "draft"
  | "matching"
  | "offered"
  | "held"
  | "customer_confirmed"
  | "worker_notified"
  | "scheduled"
  | "expired"
  | "cancelled"
  | "declined"
  | "reschedule_required"
  | "failed";

export type BookingState =
  | "DRAFT"
  | "MATCHING"
  | "OFFERED"
  | "HELD"
  | "CUSTOMER_CONFIRMED"
  | "WORKER_NOTIFIED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "DECLINED"
  | "RESCHEDULE_REQUIRED"
  | "FAILED";

export type HoldStatus = "active" | "confirmed" | "expired" | "released";
export type ScheduleReservationKind = "booking" | "hold";

export interface ServiceAreaRef {
  areaId: string;
  label: string;
  countryCode?: string;
  regionCode?: string;
  postalCode?: string;
  /** Reserved for a future geo provider; scheduling MVP matches by areaId. */
  center?: { latitude: number; longitude: number };
  radiusKm?: number;
}

export interface ServiceRequestItem {
  serviceType: string;
  quantity?: number;
  notes?: string;
}

export interface ServiceRequestAttachment {
  attachmentId: string;
  kind: "image" | "document" | "other";
  label: string;
  contentRef: string;
}

export interface ServiceRequestPreference {
  preferredWorkerIds?: string[];
  preferredTimeOfDay?: "morning" | "afternoon" | "evening";
}

export interface ServiceRequest {
  requestId: string;
  tenantId: string;
  verticalId: string;
  customerId: string;
  subjectId?: string;
  serviceType: string;
  serviceItems: ServiceRequestItem[];
  approximateArea: ServiceAreaRef;
  /** IANA timezone for requested local date/time; omitted values remain UTC-compatible. */
  timeZone?: string;
  requestedDate?: string;
  requestedTime?: string;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  estimatedDurationMin?: number;
  urgency: SchedulingUrgency;
  requirements: string[];
  attachments: ServiceRequestAttachment[];
  specialConstraints: string[];
  privacyLevel: "standard" | "sensitive" | "restricted";
  customerPreference?: ServiceRequestPreference;
  status: ServiceRequestStatus;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerCapability {
  serviceTypeId: string;
  defaultDurationMin?: number;
  minDurationMin?: number;
  maxDurationMin?: number;
}

export interface WeeklyAvailabilityRule {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
}

export interface AvailabilityException {
  exceptionId: string;
  kind: "unavailable" | "holiday";
  startAt: string;
  endAt: string;
  reason?: string;
}

export interface Worker {
  workerId: string;
  tenantId: string;
  verticalId: string;
  displayName: string;
  status: WorkerStatus;
  serviceAreaIds: string[];
  capabilities: WorkerCapability[];
  weeklyAvailability: WeeklyAvailabilityRule[];
  availabilityExceptions: AvailabilityException[];
  defaultTravelBufferMin: number;
  preparationBufferMin: number;
  cleanupBufferMin: number;
  maxServiceRadiusKm?: number;
  rating?: number;
  historicalReliability?: number;
}

export interface ScheduleReservation {
  reservationId: string;
  tenantId: string;
  verticalId: string;
  workerId: string;
  kind: ScheduleReservationKind;
  serviceRequestId?: string;
  bookingId?: string;
  holdId?: string;
  startAt: string;
  endAt: string;
  occupancyStartAt: string;
  occupancyEndAt: string;
  status: "held" | "confirmed";
  expiresAt?: string;
}

export interface MatchingWeights {
  timeProximity: number;
  geographicFit: number;
  workerCapabilityFit: number;
  workloadBalance: number;
  urgencyCompatibility: number;
  customerPreference: number;
  historicalReliability: number;
  travelCost: number;
  scheduleEfficiency: number;
}

export interface MatchingPolicy {
  policyId: string;
  version: string;
  weights: MatchingWeights;
  holdDurationMin: number;
  slotIntervalMin: number;
  searchHorizonDays: number;
  maxCandidates: number;
  defaultDayStart: string;
  defaultDayEnd: string;
}

export const DEFAULT_MATCHING_POLICY: MatchingPolicy = {
  policyId: "service-frontdesk.default-matching",
  version: "v1",
  weights: {
    timeProximity: 5,
    geographicFit: 4,
    workerCapabilityFit: 4,
    workloadBalance: 2,
    urgencyCompatibility: 2,
    customerPreference: 2,
    historicalReliability: 2,
    travelCost: 2,
    scheduleEfficiency: 2,
  },
  holdDurationMin: 5,
  slotIntervalMin: 30,
  searchHorizonDays: 7,
  maxCandidates: 8,
  defaultDayStart: "09:00",
  defaultDayEnd: "18:00",
};

export type CandidateReasonCode =
  | "available"
  | "serves_area"
  | "capability_match"
  | "exact_time_match"
  | "closest_time"
  | "low_travel_cost"
  | "schedule_efficiency"
  | "urgency_compatible"
  | "customer_preference";

export interface CandidateScoreBreakdown {
  timeProximity: number;
  geographicFit: number;
  workerCapabilityFit: number;
  workloadBalance: number;
  urgencyCompatibility: number;
  customerPreference: number;
  historicalReliability: number;
  travelCost: number;
  scheduleEfficiency: number;
}

export interface SchedulingCandidate {
  candidateId: string;
  requestId: string;
  workerId: string;
  workerDisplayName: string;
  startAt: string;
  endAt: string;
  occupancyStartAt: string;
  occupancyEndAt: string;
  score: number;
  rank: number;
  classification: "best" | "alternative" | "fallback";
  reasons: CandidateReasonCode[];
  scoreBreakdown: CandidateScoreBreakdown;
}

export interface CandidateExclusion {
  workerId: string;
  reason:
    | "tenant_mismatch"
    | "vertical_mismatch"
    | "worker_inactive"
    | "capability_mismatch"
    | "duration_out_of_bounds"
    | "area_not_served"
    | "outside_availability"
    | "availability_exception"
    | "booking_conflict"
    | "hold_conflict"
    | "invalid_request_window";
  detail: string;
}

export interface MatchingResult {
  requestId: string;
  candidates: SchedulingCandidate[];
  excluded: CandidateExclusion[];
  policyId: string;
}

export interface ScheduleHold {
  reservationId: string;
  tenantId: string;
  verticalId: string;
  workerId: string;
  customerId: string;
  kind: "hold";
  serviceRequestId: string;
  startAt: string;
  endAt: string;
  occupancyStartAt: string;
  occupancyEndAt: string;
  holdId: string;
  status: HoldStatus;
  candidateId: string;
  expiresAt: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface ScheduledBooking {
  bookingId: string;
  tenantId: string;
  verticalId: string;
  serviceRequestId: string;
  customerId: string;
  subjectId?: string;
  workerId: string;
  serviceType: string;
  startAt: string;
  endAt: string;
  occupancyStartAt: string;
  occupancyEndAt: string;
  state: BookingState;
  holdId: string;
  jobId: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobIdentity {
  jobId: string;
  side: "customer" | "worker";
  publicId: string;
  displayName: string;
  expiresAt: string;
}

export interface JobConversation {
  conversationId: string;
  tenantId: string;
  verticalId: string;
  jobId: string;
  customerAgentId: string;
  workerAgentId: string;
  state: "agent_handling" | "waiting_human" | "human_only" | "closed";
  customerPaused: boolean;
  workerPaused: boolean;
  humanTakeover: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationIntent {
  notificationId: string;
  tenantId: string;
  verticalId: string;
  jobId: string;
  audience: "customer" | "worker";
  channel: "web" | "whatsapp" | "sms" | "email";
  purpose: ServiceMessagePurpose;
  text: string;
  status: "queued" | "sent" | "failed";
  policyRequired: boolean;
  createdAt: string;
}

export interface SchedulingAuditEvent {
  auditId: string;
  tenantId: string;
  verticalId: string;
  action: string;
  actor: "customer" | "worker" | "staff" | "agent" | "system";
  targetId: string;
  result: "success" | "blocked" | "failed";
  detail: string;
  at: string;
}

export interface ScheduleWorkItemRef {
  workItemId: string;
  kind: ServiceWorkItem["kind"];
}

export interface ConfirmationResult {
  ok: boolean;
  duplicate: boolean;
  code:
    | "OK"
    | "HOLD_NOT_FOUND"
    | "HOLD_EXPIRED"
    | "HOLD_NOT_ACTIVE"
    | "TENANT_MISMATCH"
    | "VERTICAL_MISMATCH"
    | "CUSTOMER_MISMATCH"
    | "DOUBLE_BOOKING"
    | "CONFIRM_FAILED";
  booking?: ScheduledBooking;
  job?: JobRecord;
  conversation?: JobConversation;
  notificationIntents: NotificationIntent[];
  workItems: ScheduleWorkItemRef[];
}

export interface JobRecord {
  jobId: string;
  tenantId: string;
  verticalId: string;
  bookingId: string;
  customerId: string;
  workerId: string;
  customerIdentity: JobIdentity;
  workerIdentity: JobIdentity;
  privacyContextId: string;
  conversationId: string;
  createdAt: string;
  expiresAt: string;
}
