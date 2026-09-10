import type {
  CandidateExclusion,
  CandidateReasonCode,
  CandidateScoreBreakdown,
  MatchingPolicy,
  MatchingResult,
  ScheduleReservation,
  SchedulingCandidate,
  ServiceRequest,
  Worker,
  WorkerCapability,
} from "@/scheduling/types";
import { DEFAULT_MATCHING_POLICY } from "@/scheduling/types";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function clonePolicy(policy?: MatchingPolicy): MatchingPolicy {
  return {
    ...(policy ?? DEFAULT_MATCHING_POLICY),
    weights: { ...(policy?.weights ?? DEFAULT_MATCHING_POLICY.weights) },
  };
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function dateAt(date: string, clock: string, timeZone = "UTC"): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const minutes = parseClock(clock);
  if (minutes === null) return null;
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year!, month! - 1, day!, Math.floor(minutes / 60), minutes % 60);
  if (!Number.isFinite(guess)) return null;
  if (timeZone === "UTC") return new Date(guess);
  try {
    const format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const wallMillis = (value: Date): number => {
      const parts = Object.fromEntries(
        format
          .formatToParts(value)
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, part.value]),
      );
      return Date.UTC(
        Number(parts["year"]),
        Number(parts["month"]) - 1,
        Number(parts["day"]),
        Number(parts["hour"]),
        Number(parts["minute"]),
        Number(parts["second"]),
      );
    };
    const first = new Date(guess);
    const firstOffset = wallMillis(first) - guess;
    const candidate = new Date(guess - firstOffset);
    const correctedOffset = wallMillis(candidate) - candidate.getTime();
    return new Date(guess - correctedOffset);
  } catch {
    return null;
  }
}

function datePart(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function zonedParts(
  value: Date,
  timeZone: string,
): { date: string; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; minutes: number } | null {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(value)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const weekdays: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const weekday = weekdays[parts["weekday"] ?? ""];
    if (weekday === undefined) return null;
    return {
      date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
      weekday,
      minutes: Number(parts["hour"]) * 60 + Number(parts["minute"]),
    };
  } catch {
    return null;
  }
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundUpToInterval(value: Date, intervalMin: number): Date {
  const interval = Math.max(1, intervalMin) * MINUTE;
  return new Date(Math.ceil(value.getTime() / interval) * interval);
}

function durationFor(
  request: ServiceRequest,
  worker: Worker,
  capability: WorkerCapability,
): number {
  if (request.estimatedDurationMin !== undefined) return request.estimatedDurationMin;
  const itemDuration = request.serviceItems.reduce((total, item) => {
    const itemCapability = worker.capabilities.find(
      (candidate) => candidate.serviceTypeId === item.serviceType,
    );
    const quantity = Math.max(1, item.quantity ?? 1);
    return total + (itemCapability?.defaultDurationMin ?? 0) * quantity;
  }, 0);
  return itemDuration || capability.defaultDurationMin || 60;
}

function requestWindow(
  request: ServiceRequest,
  policy: MatchingPolicy,
  now: Date,
): { start: Date; end: Date; requested: Date | null } | null {
  if (request.timeWindowStart || request.timeWindowEnd) {
    if (!request.timeWindowStart || !request.timeWindowEnd) return null;
    const start = new Date(request.timeWindowStart);
    const end = new Date(request.timeWindowEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    const requested =
      request.requestedTime && request.requestedDate
        ? dateAt(request.requestedDate, request.requestedTime, request.timeZone)
        : null;
    return { start, end, requested };
  }

  const date =
    request.requestedDate ?? zonedParts(now, request.timeZone ?? "UTC")?.date ?? datePart(now);
  const dayStart = dateAt(date, policy.defaultDayStart, request.timeZone);
  const dayEnd = dateAt(date, policy.defaultDayEnd, request.timeZone);
  if (!dayStart || !dayEnd || dayEnd <= dayStart) return null;

  const requested = request.requestedTime
    ? dateAt(date, request.requestedTime, request.timeZone)
    : null;
  if (!requested) {
    const start = request.requestedDate
      ? dayStart
      : new Date(Math.max(dayStart.getTime(), now.getTime()));
    return start < dayEnd ? { start, end: dayEnd, requested: null } : null;
  }

  const searchRadius = 2 * 60 * MINUTE;
  const start = new Date(Math.max(dayStart.getTime(), requested.getTime() - searchRadius));
  const end = new Date(Math.min(dayEnd.getTime(), requested.getTime() + searchRadius));
  return start < end ? { start, end, requested } : null;
}

function withinWeeklyAvailability(
  worker: Worker,
  start: Date,
  end: Date,
  timeZone = "UTC",
): boolean {
  const startParts = zonedParts(start, timeZone);
  const endParts = zonedParts(end, timeZone);
  if (!startParts || !endParts || startParts.date !== endParts.date) return false;
  const weekday = startParts.weekday;
  const startMinutes = startParts.minutes;
  const endMinutes = endParts.minutes;
  return worker.weeklyAvailability.some((rule) => {
    const ruleStart = parseClock(rule.startTime);
    const ruleEnd = parseClock(rule.endTime);
    return (
      rule.weekday === weekday &&
      ruleStart !== null &&
      ruleEnd !== null &&
      ruleStart <= startMinutes &&
      endMinutes <= ruleEnd
    );
  });
}

function hitsException(worker: Worker, start: Date, end: Date): boolean {
  return worker.availabilityExceptions.some((exception) => {
    const exceptionStart = new Date(exception.startAt);
    const exceptionEnd = new Date(exception.endAt);
    return (
      !Number.isNaN(exceptionStart.getTime()) &&
      !Number.isNaN(exceptionEnd.getTime()) &&
      overlaps(start, end, exceptionStart, exceptionEnd)
    );
  });
}

function activeReservations(
  reservations: readonly ScheduleReservation[],
  now: Date,
): ScheduleReservation[] {
  return reservations.filter((reservation) => {
    if (reservation.status === "confirmed") return true;
    if (reservation.status !== "held") return false;
    if (!reservation.expiresAt) return false;
    const expiresAt = new Date(reservation.expiresAt);
    return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
  });
}

function matchesService(
  worker: Worker,
  request: ServiceRequest,
): { capability: WorkerCapability; fit: number } | null {
  const serviceTypes = [
    request.serviceType,
    ...request.serviceItems.map((item) => item.serviceType),
  ].filter((serviceType, index, all) => all.indexOf(serviceType) === index);
  const capabilities = serviceTypes.map((serviceType) =>
    worker.capabilities.find((candidate) => candidate.serviceTypeId === serviceType),
  );
  if (capabilities.some((capability) => !capability)) return null;
  const primary = capabilities[0];
  return primary
    ? { capability: primary, fit: capabilities.length / Math.max(1, worker.capabilities.length) }
    : null;
}

function scoreCandidate(input: {
  request: ServiceRequest;
  worker: Worker;
  start: Date;
  end: Date;
  occupancyStart: Date;
  occupancyEnd: Date;
  requested: Date | null;
  reservations: readonly ScheduleReservation[];
  policy: MatchingPolicy;
}): { score: number; reasons: CandidateReasonCode[]; breakdown: CandidateScoreBreakdown } {
  const {
    request,
    worker,
    start,
    end,
    occupancyStart,
    occupancyEnd,
    requested,
    reservations,
    policy,
  } = input;
  const workerReservations = reservations.filter(
    (reservation) => reservation.workerId === worker.workerId,
  );
  const requestedDistance = requested ? Math.abs(start.getTime() - requested.getTime()) : 0;
  const timeProximity = requested ? clamp(1 - requestedDistance / (2 * 60 * MINUTE)) : 0.7;
  const workloadBalance = clamp(1 - workerReservations.length / 6);
  const urgencyCompatibility =
    request.urgency === "emergency" || request.urgency === "urgent" ? 0.9 : 1;
  const preferred =
    request.customerPreference?.preferredWorkerIds?.includes(worker.workerId) ?? false;
  const customerPreference = preferred ? 1 : 0.5;
  const historicalReliability = clamp(worker.historicalReliability ?? 0.7);
  const travelCost = clamp(1 - worker.defaultTravelBufferMin / 120);
  const scheduleEfficiency = clamp(
    (end.getTime() - start.getTime()) /
      Math.max(1, occupancyEnd.getTime() - occupancyStart.getTime()),
  );
  const breakdown: CandidateScoreBreakdown = {
    timeProximity,
    geographicFit: 1,
    workerCapabilityFit: 1,
    workloadBalance,
    urgencyCompatibility,
    customerPreference,
    historicalReliability,
    travelCost,
    scheduleEfficiency,
  };
  const weights = policy.weights;
  const totalWeight = Object.values(weights).reduce(
    (total, weight) => total + Math.max(0, weight),
    0,
  );
  const score =
    totalWeight === 0
      ? 0
      : Object.entries(weights).reduce(
          (total, [key, weight]) =>
            total + breakdown[key as keyof CandidateScoreBreakdown] * Math.max(0, weight),
          0,
        ) / totalWeight;
  const reasons: CandidateReasonCode[] = ["available", "serves_area", "capability_match"];
  if (requested && requestedDistance === 0) reasons.push("exact_time_match");
  else reasons.push("closest_time");
  if (worker.defaultTravelBufferMin <= 30) reasons.push("low_travel_cost");
  if (scheduleEfficiency >= 0.7) reasons.push("schedule_efficiency");
  if (request.urgency === "urgent" || request.urgency === "emergency")
    reasons.push("urgency_compatible");
  if (preferred) reasons.push("customer_preference");
  return { score: Number(score.toFixed(4)), reasons, breakdown };
}

function exclusion(
  workerId: string,
  reason: CandidateExclusion["reason"],
  detail: string,
): CandidateExclusion {
  return { workerId, reason, detail };
}

const EXCLUSION_PRIORITY: Record<CandidateExclusion["reason"], number> = {
  invalid_request_window: 10,
  tenant_mismatch: 10,
  vertical_mismatch: 10,
  worker_inactive: 10,
  capability_mismatch: 10,
  duration_out_of_bounds: 10,
  area_not_served: 10,
  booking_conflict: 5,
  hold_conflict: 5,
  availability_exception: 4,
  outside_availability: 1,
};

function preferExclusion(
  current: CandidateExclusion | null,
  next: CandidateExclusion,
): CandidateExclusion {
  return !current || EXCLUSION_PRIORITY[next.reason] > EXCLUSION_PRIORITY[current.reason]
    ? next
    : current;
}

export function matchServiceRequest(input: {
  request: ServiceRequest;
  workers: readonly Worker[];
  reservations: readonly ScheduleReservation[];
  policy?: MatchingPolicy;
  now?: Date;
}): MatchingResult {
  const policy = clonePolicy(input.policy);
  const now = input.now ?? new Date();
  const window = requestWindow(input.request, policy, now);
  if (!window) {
    return {
      requestId: input.request.requestId,
      candidates: [],
      excluded: input.workers.map((worker) =>
        exclusion(worker.workerId, "invalid_request_window", "requested time window is invalid"),
      ),
      policyId: policy.policyId,
    };
  }

  const reservations = activeReservations(input.reservations, now);
  const candidates: SchedulingCandidate[] = [];
  const excluded: CandidateExclusion[] = [];
  const interval = Math.max(1, policy.slotIntervalMin);
  const requestedSlot =
    window.requested && window.requested >= window.start && window.requested < window.end
      ? window.requested
      : null;

  for (const worker of input.workers) {
    if (worker.tenantId !== input.request.tenantId) {
      excluded.push(
        exclusion(worker.workerId, "tenant_mismatch", "worker belongs to another tenant"),
      );
      continue;
    }
    if (worker.verticalId !== input.request.verticalId) {
      excluded.push(
        exclusion(worker.workerId, "vertical_mismatch", "worker belongs to another vertical"),
      );
      continue;
    }
    if (worker.status !== "active") {
      excluded.push(
        exclusion(worker.workerId, "worker_inactive", `worker status is ${worker.status}`),
      );
      continue;
    }
    const serviceMatch = matchesService(worker, input.request);
    if (!serviceMatch) {
      excluded.push(
        exclusion(
          worker.workerId,
          "capability_mismatch",
          "worker does not provide all requested services",
        ),
      );
      continue;
    }
    const durationMin = durationFor(input.request, worker, serviceMatch.capability);
    if (
      !Number.isFinite(durationMin) ||
      durationMin <= 0 ||
      (serviceMatch.capability.minDurationMin !== undefined &&
        durationMin < serviceMatch.capability.minDurationMin) ||
      (serviceMatch.capability.maxDurationMin !== undefined &&
        durationMin > serviceMatch.capability.maxDurationMin)
    ) {
      excluded.push(
        exclusion(
          worker.workerId,
          "duration_out_of_bounds",
          "requested service duration is outside worker capability bounds",
        ),
      );
      continue;
    }
    if (!worker.serviceAreaIds.includes(input.request.approximateArea.areaId)) {
      excluded.push(
        exclusion(worker.workerId, "area_not_served", "worker does not serve the requested area"),
      );
      continue;
    }

    const starts: Date[] = [];
    if (requestedSlot) starts.push(new Date(requestedSlot));
    for (
      let cursor = roundUpToInterval(window.start, interval);
      cursor < window.end;
      cursor = new Date(cursor.getTime() + interval * MINUTE)
    ) {
      if (!starts.some((start) => start.getTime() === cursor.getTime())) starts.push(cursor);
    }
    let workerReason: CandidateExclusion | null = null;
    for (const start of starts) {
      const end = new Date(start.getTime() + durationMin * MINUTE);
      const occupancyStart = new Date(
        start.getTime() - (worker.defaultTravelBufferMin + worker.preparationBufferMin) * MINUTE,
      );
      const occupancyEnd = new Date(end.getTime() + worker.cleanupBufferMin * MINUTE);
      if (end > window.end || occupancyStart < window.start || occupancyEnd > window.end) {
        workerReason = preferExclusion(
          workerReason,
          exclusion(
            worker.workerId,
            "outside_availability",
            "service plus buffers fall outside requested window",
          ),
        );
        continue;
      }
      if (!withinWeeklyAvailability(worker, occupancyStart, occupancyEnd, input.request.timeZone)) {
        workerReason = preferExclusion(
          workerReason,
          exclusion(
            worker.workerId,
            "outside_availability",
            "service plus buffers fall outside weekly availability",
          ),
        );
        continue;
      }
      if (hitsException(worker, occupancyStart, occupancyEnd)) {
        workerReason = preferExclusion(
          workerReason,
          exclusion(
            worker.workerId,
            "availability_exception",
            "temporary unavailable period or holiday overlaps slot",
          ),
        );
        continue;
      }
      const conflict = reservations.find(
        (reservation) =>
          reservation.workerId === worker.workerId &&
          overlaps(
            occupancyStart,
            occupancyEnd,
            new Date(reservation.occupancyStartAt),
            new Date(reservation.occupancyEndAt),
          ),
      );
      if (conflict) {
        workerReason = preferExclusion(
          workerReason,
          exclusion(
            worker.workerId,
            conflict.kind === "hold" ? "hold_conflict" : "booking_conflict",
            "worker occupancy overlaps an active reservation",
          ),
        );
        continue;
      }
      const scored = scoreCandidate({
        request: input.request,
        worker,
        start,
        end,
        occupancyStart,
        occupancyEnd,
        requested: window.requested,
        reservations,
        policy,
      });
      candidates.push({
        candidateId: `${input.request.requestId}:${worker.workerId}:${start.toISOString()}`,
        requestId: input.request.requestId,
        workerId: worker.workerId,
        workerDisplayName: worker.displayName,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        occupancyStartAt: occupancyStart.toISOString(),
        occupancyEndAt: occupancyEnd.toISOString(),
        score: scored.score,
        rank: 0,
        classification: "fallback",
        reasons: scored.reasons,
        scoreBreakdown: scored.breakdown,
      });
    }
    if (workerReason && !candidates.some((candidate) => candidate.workerId === worker.workerId))
      excluded.push(workerReason);
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.startAt.localeCompare(b.startAt) ||
      a.workerId.localeCompare(b.workerId),
  );
  const limited: SchedulingCandidate[] = candidates
    .slice(0, Math.max(1, policy.maxCandidates))
    .map((candidate, index, all) => ({
      ...candidate,
      rank: index + 1,
      classification: (index === 0
        ? "best"
        : candidate.score >= (all[0]?.score ?? 0) * 0.8
          ? "alternative"
          : "fallback") as SchedulingCandidate["classification"],
    }));
  return {
    requestId: input.request.requestId,
    candidates: limited,
    excluded,
    policyId: policy.policyId,
  };
}

export function calculateOccupancyInterval(input: {
  startAt: string;
  durationMin: number;
  worker: Pick<Worker, "defaultTravelBufferMin" | "preparationBufferMin" | "cleanupBufferMin">;
}): { startAt: string; endAt: string; occupancyStartAt: string; occupancyEndAt: string } | null {
  const start = new Date(input.startAt);
  if (
    Number.isNaN(start.getTime()) ||
    !Number.isFinite(input.durationMin) ||
    input.durationMin <= 0
  )
    return null;
  const end = new Date(start.getTime() + input.durationMin * MINUTE);
  const occupancyStart = new Date(
    start.getTime() -
      (input.worker.defaultTravelBufferMin + input.worker.preparationBufferMin) * MINUTE,
  );
  const occupancyEnd = new Date(end.getTime() + input.worker.cleanupBufferMin * MINUTE);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    occupancyStartAt: occupancyStart.toISOString(),
    occupancyEndAt: occupancyEnd.toISOString(),
  };
}

export function addDaysUtc(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY);
}
