export type SchedulingId = string;
export type SchedulingIsoDateTime = string;

export type ServiceRequestUrgency = "flexible" | "normal" | "urgent" | "emergency";

export type ServiceRequestStatus =
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

export type ScheduleHoldStatus = "ACTIVE" | "CONFIRMED" | "EXPIRED" | "RELEASED";

export type ServiceScheduleBookingStatus =
  "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED";

export type WorkerStatus = "active" | "inactive";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * MVP uses areaId/postalCode. Geo data is optional so the same contract can
 * later support radius and routing providers without hard-coding a city.
 */
export interface ServiceArea {
  areaId: string;
  label: string;
  countryCode?: string;
  postalCodes?: string[];
  center?: GeoPoint;
  maxServiceRadiusKm?: number;
}

export interface WorkerCapability {
  serviceTypeIds: string[];
  skillTags?: string[];
}

export interface WeeklyAvailabilityRule {
  id: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  timezone: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface AvailabilityException {
  id: string;
  date: string;
  kind: "unavailable" | "available";
  startTime?: string;
  endTime?: string;
  reason: string;
}

export type WorkerScheduleBlockKind =
  | "confirmed_booking"
  | "hold"
  | "temporary_unavailable"
  | "travel_buffer"
  | "preparation_buffer"
  | "cleanup_buffer";

export interface WorkerScheduleBlock {
  id: string;
  startAt: SchedulingIsoDateTime;
  endAt: SchedulingIsoDateTime;
  kind: WorkerScheduleBlockKind;
  status: "active" | "released";
  sourceId?: string;
}

export interface WorkerAvailability {
  weeklyRules: WeeklyAvailabilityRule[];
  exceptions: AvailabilityException[];
  /** Confirmed orders, holds and temporary blocks are all explicit here. */
  blocks: WorkerScheduleBlock[];
}

export interface ServiceWorker {
  id: SchedulingId;
  tenantId: string;
  verticalId: string;
  displayName: string;
  status: WorkerStatus;
  timezone: string;
  serviceAreas: ServiceArea[];
  capabilities: WorkerCapability[];
  availability: WorkerAvailability;
  reliabilityScore?: number;
  supportedUrgencies?: ServiceRequestUrgency[];
}

export interface ServiceRequestItem {
  itemId: string;
  label?: string;
  estimatedDurationMin?: number;
}

export interface ApproximateAreaRequest {
  areaId?: string;
  label?: string;
  countryCode?: string;
  postalCode?: string;
  center?: GeoPoint;
}

export interface ServiceRequestPreference {
  preferredWorkerIds?: string[];
  preferredStartAt?: SchedulingIsoDateTime;
}

export interface ServiceRequest {
  requestId: SchedulingId;
  tenantId: string;
  verticalId: string;
  customerId: string;
  serviceType: string;
  serviceItems: ServiceRequestItem[];
  approximateArea?: ApproximateAreaRequest;
  requestedDate?: string;
  requestedTime?: string;
  timeWindowStart?: SchedulingIsoDateTime;
  timeWindowEnd?: SchedulingIsoDateTime;
  estimatedDurationMin?: number;
  urgency: ServiceRequestUrgency;
  requirements: string[];
  attachments: string[];
  specialConstraints: string[];
  privacyLevel: "standard" | "sensitive" | "restricted";
  status: ServiceRequestStatus;
  preference?: ServiceRequestPreference;
  selectedCandidateId?: string;
  currentHoldId?: string;
  createdAt: SchedulingIsoDateTime;
  updatedAt: SchedulingIsoDateTime;
}

export interface ServiceDurationPolicy {
  serviceTypeId: string;
  defaultDurationMin: number;
  minDurationMin?: number;
  maxDurationMin?: number;
  travelBufferMin: number;
  preparationBufferMin: number;
  cleanupBufferMin: number;
}

export interface DurationWindow {
  serviceDurationMin: number;
  totalDurationMin: number;
  travelBufferMin: number;
  preparationBufferMin: number;
  cleanupBufferMin: number;
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
  id: string;
  weights: MatchingWeights;
  slotIncrementMin: number;
  holdDurationMin: number;
  maxCandidates: number;
  allowRestrictedPrivacyLevel: boolean;
}

export interface SchedulingCandidate {
  candidateId: string;
  requestId: string;
  tenantId: string;
  verticalId: string;
  workerId: string;
  workerName: string;
  serviceStartAt: SchedulingIsoDateTime;
  serviceEndAt: SchedulingIsoDateTime;
  reservedStartAt: SchedulingIsoDateTime;
  reservedEndAt: SchedulingIsoDateTime;
  score: number;
  tier: "best" | "alternative" | "fallback";
  reasonCodes: string[];
  reasons: string[];
}

export interface SchedulingExclusion {
  workerId: string;
  workerName: string;
  reasonCode: string;
  reason: string;
}

export interface SchedulingMatchResult {
  requestId: string;
  duration: DurationWindow;
  candidates: SchedulingCandidate[];
  bestCandidate: SchedulingCandidate | null;
  alternativeCandidates: SchedulingCandidate[];
  fallbackCandidates: SchedulingCandidate[];
  excluded: SchedulingExclusion[];
  policyId: string;
}

export interface ScheduleHold {
  holdId: SchedulingId;
  tenantId: string;
  verticalId: string;
  workerId: string;
  customerId: string;
  serviceRequestId: string;
  candidateId: string;
  serviceStartAt: SchedulingIsoDateTime;
  serviceEndAt: SchedulingIsoDateTime;
  reservedStartAt: SchedulingIsoDateTime;
  reservedEndAt: SchedulingIsoDateTime;
  expiresAt: SchedulingIsoDateTime;
  status: ScheduleHoldStatus;
  idempotencyKey: string;
  createdAt: SchedulingIsoDateTime;
  updatedAt: SchedulingIsoDateTime;
}

export interface ServiceScheduleBooking {
  bookingId: SchedulingId;
  tenantId: string;
  verticalId: string;
  workerId: string;
  customerId: string;
  serviceRequestId: string;
  holdId: string;
  serviceStartAt: SchedulingIsoDateTime;
  serviceEndAt: SchedulingIsoDateTime;
  reservedStartAt: SchedulingIsoDateTime;
  reservedEndAt: SchedulingIsoDateTime;
  status: ServiceScheduleBookingStatus;
  confirmationIdempotencyKey: string;
  createdAt: SchedulingIsoDateTime;
  updatedAt: SchedulingIsoDateTime;
  failureReason?: string;
}
