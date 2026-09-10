import type {
  AvailabilityException,
  DurationWindow,
  GeoPoint,
  MatchingPolicy,
  SchedulingCandidate,
  SchedulingExclusion,
  SchedulingMatchResult,
  ServiceDurationPolicy,
  ServiceRequest,
  ServiceWorker,
  WorkerScheduleBlock,
} from "@/scheduling/types";

export const DEFAULT_MATCHING_POLICY: MatchingPolicy = {
  id: "service-frontdesk.default-matching.v1",
  weights: {
    timeProximity: 1,
    geographicFit: 1,
    workerCapabilityFit: 1,
    workloadBalance: 0.7,
    urgencyCompatibility: 0.5,
    customerPreference: 0.8,
    historicalReliability: 0.6,
    travelCost: 0.7,
    scheduleEfficiency: 0.6,
  },
  slotIncrementMin: 30,
  holdDurationMin: 5,
  maxCandidates: 12,
  allowRestrictedPrivacyLevel: false,
};

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  date: string;
}

interface AreaFit {
  ok: boolean;
  score: number;
  reasonCode: string;
  reason: string;
  distanceKm?: number;
}

interface RequestRange {
  from: Date;
  to: Date;
  exactStartAt: string | null;
}

function validDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseClock(value: string | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (
    hour === undefined ||
    minute === undefined ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localParts(value: Date, timeZone: string): LocalDateParts {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(value).map((part) => [part.type, part.value]),
    );
    const year = Number(parts["year"]);
    const month = Number(parts["month"]);
    const day = Number(parts["day"]);
    const hour = Number(parts["hour"]);
    const minute = Number(parts["minute"]);
    const weekday = new Date(
      Date.UTC(year, month - 1, day),
    ).getUTCDay() as LocalDateParts["weekday"];
    return {
      year,
      month,
      day,
      hour,
      minute,
      weekday,
      date: formatDate(year, month, day),
    };
  } catch {
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    return {
      year,
      month,
      day,
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      weekday: value.getUTCDay() as LocalDateParts["weekday"],
      date: formatDate(year, month, day),
    };
  }
}

/** Convert a wall-clock date/time in a tenant timezone into an instant. */
function localDateTime(date: string, clock: string, timeZone: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  const minutes = parseClock(clock);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    minutes === null
  ) {
    return null;
  }

  const targetUtc = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let guess = targetUtc;
  for (let i = 0; i < 3; i += 1) {
    const current = localParts(new Date(guess), timeZone);
    const currentAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
    );
    guess = targetUtc - (currentAsUtc - guess);
  }
  const result = new Date(guess);
  return Number.isFinite(result.getTime()) ? result : null;
}

function requestRange(request: ServiceRequest, timezone: string, now: Date): RequestRange {
  const explicitFrom = validDate(request.timeWindowStart);
  const explicitTo = validDate(request.timeWindowEnd);
  if (explicitFrom && explicitTo && explicitTo > explicitFrom) {
    return {
      from: explicitFrom,
      to: explicitTo,
      exactStartAt:
        request.requestedTime && request.requestedDate
          ? (localDateTime(request.requestedDate, request.requestedTime, timezone)?.toISOString() ??
            null)
          : null,
    };
  }

  if (request.requestedDate) {
    const from = localDateTime(request.requestedDate, request.requestedTime ?? "00:00", timezone);
    if (from) {
      if (request.requestedTime) {
        const dayStart = localDateTime(request.requestedDate, "00:00", timezone) ?? from;
        const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60_000);
        return {
          // requestedTime is the desired service start, not the full reserved
          // window. Keep the whole local day available so buffers may begin
          // before the requested service time and end after it.
          from: dayStart,
          to: nextDay,
          exactStartAt: from.toISOString(),
        };
      }
      const nextDay = new Date(from.getTime() + 24 * 60 * 60_000);
      return { from, to: nextDay, exactStartAt: null };
    }
  }

  const from = validDate(request.timeWindowStart) ?? now;
  return {
    from,
    to: validDate(request.timeWindowEnd) ?? new Date(from.getTime() + 14 * 24 * 60 * 60_000),
    exactStartAt: null,
  };
}

function minutesAt(value: Date, timezone: string): number {
  const parts = localParts(value, timezone);
  return parts.hour * 60 + parts.minute;
}

function dateIsWithin(value: string, from: string | undefined, to: string | undefined): boolean {
  return (!from || value >= from) && (!to || value <= to);
}

function exceptionCovers(exception: AvailabilityException, start: number, end: number): boolean {
  const exceptionStart = parseClock(exception.startTime);
  const exceptionEnd = parseClock(exception.endTime);
  if (exceptionStart === null || exceptionEnd === null) return true;
  return exceptionStart <= start && end <= exceptionEnd;
}

function availabilityCovers(
  worker: ServiceWorker,
  reservedStart: Date,
  reservedEnd: Date,
): boolean {
  const start = localParts(reservedStart, worker.timezone);
  const end = localParts(reservedEnd, worker.timezone);
  if (start.date !== end.date) return false;
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  const exceptions = worker.availability.exceptions.filter(
    (exception) => exception.date === start.date,
  );

  if (
    exceptions.some(
      (exception) =>
        exception.kind === "unavailable" &&
        (exception.startTime === undefined ||
          exception.endTime === undefined ||
          Boolean(
            parseClock(exception.startTime) !== null &&
            parseClock(exception.endTime) !== null &&
            parseClock(exception.startTime)! < endMinutes &&
            startMinutes < parseClock(exception.endTime)!,
          )),
    )
  ) {
    return false;
  }

  const explicitAvailable = exceptions.some(
    (exception) =>
      exception.kind === "available" && exceptionCovers(exception, startMinutes, endMinutes),
  );
  if (explicitAvailable) return true;

  return worker.availability.weeklyRules.some((rule) => {
    if (
      rule.weekday !== start.weekday ||
      !dateIsWithin(start.date, rule.effectiveFrom, rule.effectiveTo)
    ) {
      return false;
    }
    const ruleStart = parseClock(rule.startTime);
    const ruleEnd = parseClock(rule.endTime);
    return (
      ruleStart !== null && ruleEnd !== null && ruleStart <= startMinutes && endMinutes <= ruleEnd
    );
  });
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function activeBlockOverlaps(worker: ServiceWorker, start: Date, end: Date): boolean {
  return worker.availability.blocks.some((block: WorkerScheduleBlock) => {
    if (block.status !== "active") return false;
    const blockStart = validDate(block.startAt);
    const blockEnd = validDate(block.endAt);
    return Boolean(blockStart && blockEnd && overlaps(start, end, blockStart, blockEnd));
  });
}

function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6_371;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const latA = radians(a.latitude);
  const latB = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function areaFit(request: ServiceRequest, worker: ServiceWorker): AreaFit {
  const requested = request.approximateArea;
  if (!requested || (!requested.areaId && !requested.postalCode && !requested.center)) {
    return { ok: true, score: 0.5, reasonCode: "area_not_provided", reason: "area_not_provided" };
  }

  for (const area of worker.serviceAreas) {
    if (requested.areaId && area.areaId === requested.areaId) {
      return { ok: true, score: 1, reasonCode: "serves_area", reason: "serves_area" };
    }
    if (
      requested.postalCode &&
      area.postalCodes?.some((postalCode) => postalCode === requested.postalCode)
    ) {
      return {
        ok: true,
        score: 0.9,
        reasonCode: "serves_postal_code",
        reason: "serves_postal_code",
      };
    }
    if (requested.center && area.center && area.maxServiceRadiusKm !== undefined) {
      const distance = distanceKm(requested.center, area.center);
      if (distance <= area.maxServiceRadiusKm) {
        return {
          ok: true,
          score: Math.max(0.1, 1 - distance / Math.max(area.maxServiceRadiusKm, 1)),
          reasonCode: "serves_radius",
          reason: "serves_radius",
          distanceKm: distance,
        };
      }
    }
  }

  return { ok: false, score: 0, reasonCode: "area_not_served", reason: "area_not_served" };
}

function capabilityFit(request: ServiceRequest, worker: ServiceWorker): boolean {
  const required = [request.serviceType, ...request.serviceItems.map((item) => item.itemId)];
  return worker.capabilities.some((capability) =>
    required.every((id) => capability.serviceTypeIds.includes(id)),
  );
}

function urgencyFit(request: ServiceRequest, worker: ServiceWorker): number {
  if (!worker.supportedUrgencies?.length) return 0.7;
  return worker.supportedUrgencies.includes(request.urgency) ? 1 : 0.25;
}

function workloadFit(worker: ServiceWorker): number {
  const count = worker.availability.blocks.filter(
    (block) => block.status === "active" && block.kind === "confirmed_booking",
  ).length;
  return 1 / (1 + count);
}

function reliabilityFit(worker: ServiceWorker): number {
  if (worker.reliabilityScore === undefined) return 0.5;
  return Math.min(1, Math.max(0, worker.reliabilityScore));
}

function normalizedWeights(policy: MatchingPolicy): MatchingPolicy["weights"] {
  const entries = Object.entries(policy.weights) as [keyof MatchingPolicy["weights"], number][];
  return Object.fromEntries(
    entries.map(([key, value]) => [key, Number.isFinite(value) && value > 0 ? value : 0]),
  ) as unknown as MatchingPolicy["weights"];
}

function weightedScore(
  values: MatchingPolicy["weights"],
  scores: MatchingPolicy["weights"],
): number {
  const weights = normalizedWeights({ ...DEFAULT_MATCHING_POLICY, weights: values });
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  return Math.max(
    0,
    Math.min(
      1,
      Object.keys(weights).reduce((sum, key) => {
        const typedKey = key as keyof MatchingPolicy["weights"];
        return sum + weights[typedKey] * scores[typedKey];
      }, 0) / total,
    ),
  );
}

function durationWindow(
  request: ServiceRequest,
  policy: ServiceDurationPolicy | undefined,
): DurationWindow {
  const serviceDurationMin = Math.min(
    policy?.maxDurationMin ?? Number.POSITIVE_INFINITY,
    Math.max(
      policy?.minDurationMin ?? 1,
      request.estimatedDurationMin ?? policy?.defaultDurationMin ?? 60,
    ),
  );
  const travelBufferMin = Math.max(0, policy?.travelBufferMin ?? 0);
  const preparationBufferMin = Math.max(0, policy?.preparationBufferMin ?? 0);
  const cleanupBufferMin = Math.max(0, policy?.cleanupBufferMin ?? 0);
  return {
    serviceDurationMin,
    totalDurationMin:
      serviceDurationMin + travelBufferMin + preparationBufferMin + cleanupBufferMin,
    travelBufferMin,
    preparationBufferMin,
    cleanupBufferMin,
  };
}

function mergePolicy(policy: Partial<MatchingPolicy> | undefined): MatchingPolicy {
  return {
    ...DEFAULT_MATCHING_POLICY,
    ...(policy ?? {}),
    weights: { ...DEFAULT_MATCHING_POLICY.weights, ...(policy?.weights ?? {}) },
  };
}

function reasonForTime(
  request: ServiceRequest,
  start: Date,
  range: RequestRange,
  timezone: string,
): {
  score: number;
  code: string;
  reason: string;
} {
  const requested =
    validDate(request.preference?.preferredStartAt) ??
    (range.exactStartAt ? new Date(range.exactStartAt) : range.from);
  const differenceMin = Math.abs(start.getTime() - requested.getTime()) / 60_000;
  if (range.exactStartAt && differenceMin < 1) {
    return { score: 1, code: "exact_time_match", reason: "exact_time_match" };
  }
  const rangeMinutes = Math.max(30, (range.to.getTime() - range.from.getTime()) / 60_000);
  const score = Math.max(0.1, 1 - differenceMin / rangeMinutes);
  const local = localParts(start, timezone);
  return {
    score,
    code: differenceMin <= 30 ? "near_requested_time" : "available_window",
    reason:
      differenceMin <= 30
        ? "near_requested_time"
        : `available_at_${local.hour.toString().padStart(2, "0")}:${local.minute.toString().padStart(2, "0")}`,
  };
}

function candidateTier(index: number): SchedulingCandidate["tier"] {
  if (index === 0) return "best";
  if (index < 3) return "alternative";
  return "fallback";
}

export function resolveDurationWindow(
  request: ServiceRequest,
  policies: readonly ServiceDurationPolicy[],
): DurationWindow {
  return durationWindow(
    request,
    policies.find((item) => item.serviceTypeId === request.serviceType),
  );
}

/**
 * Deterministic two-stage matching: hard constraints first, then explainable
 * weighted ranking. The input deliberately contains no customer phone or full
 * address, so the matching engine cannot accidentally disclose identity data.
 */
export function matchServiceRequest(input: {
  request: ServiceRequest;
  workers: readonly ServiceWorker[];
  durationPolicies: readonly ServiceDurationPolicy[];
  timezone: string;
  policy?: Partial<MatchingPolicy>;
  now?: Date;
}): SchedulingMatchResult {
  const policy = mergePolicy(input.policy);
  const requestRangeValue = requestRange(input.request, input.timezone, input.now ?? new Date());
  const duration = resolveDurationWindow(input.request, input.durationPolicies);
  const exclusions: SchedulingExclusion[] = [];
  const candidates: SchedulingCandidate[] = [];
  const incrementMs = Math.max(1, policy.slotIncrementMin) * 60_000;

  for (const worker of input.workers) {
    const exclude = (reasonCode: string, reason: string) => {
      exclusions.push({ workerId: worker.id, workerName: worker.displayName, reasonCode, reason });
    };

    if (worker.tenantId !== input.request.tenantId) {
      exclude("TENANT_MISMATCH", "tenant_mismatch");
      continue;
    }
    if (worker.verticalId !== input.request.verticalId) {
      exclude("VERTICAL_MISMATCH", "vertical_mismatch");
      continue;
    }
    if (worker.status !== "active") {
      exclude("WORKER_INACTIVE", "worker_inactive");
      continue;
    }
    if (input.request.privacyLevel === "restricted" && !policy.allowRestrictedPrivacyLevel) {
      exclude("PRIVACY_POLICY_BLOCKED", "privacy_policy_blocked");
      continue;
    }
    if (!capabilityFit(input.request, worker)) {
      exclude("SERVICE_CAPABILITY_MISMATCH", "service_capability_mismatch");
      continue;
    }

    const area = areaFit(input.request, worker);
    if (!area.ok) {
      exclude(area.reasonCode, area.reason);
      continue;
    }

    const exactStart = requestRangeValue.exactStartAt
      ? new Date(requestRangeValue.exactStartAt)
      : null;
    for (
      let cursor = Math.ceil(requestRangeValue.from.getTime() / incrementMs) * incrementMs;
      cursor + duration.totalDurationMin * 60_000 <= requestRangeValue.to.getTime();
      cursor += incrementMs
    ) {
      const serviceStart = exactStart ?? new Date(cursor);
      if (exactStart && Math.abs(serviceStart.getTime() - cursor) > incrementMs / 2) continue;
      const reservedStart = new Date(
        serviceStart.getTime() -
          (duration.travelBufferMin + duration.preparationBufferMin) * 60_000,
      );
      const serviceEnd = new Date(serviceStart.getTime() + duration.serviceDurationMin * 60_000);
      const reservedEnd = new Date(serviceEnd.getTime() + duration.cleanupBufferMin * 60_000);
      if (reservedStart < requestRangeValue.from || reservedEnd > requestRangeValue.to) continue;
      if (!availabilityCovers(worker, reservedStart, reservedEnd)) continue;
      if (activeBlockOverlaps(worker, reservedStart, reservedEnd)) continue;

      const time = reasonForTime(input.request, serviceStart, requestRangeValue, input.timezone);
      const preferenceScore = input.request.preference?.preferredWorkerIds?.length
        ? input.request.preference.preferredWorkerIds.includes(worker.id)
          ? 1
          : 0.35
        : 0.5;
      const urgencyScore = urgencyFit(input.request, worker);
      const travelScore = area.distanceKm === undefined ? area.score : 1 / (1 + area.distanceKm);
      const efficiencyScore =
        duration.totalDurationMin === 0
          ? 0
          : duration.serviceDurationMin / duration.totalDurationMin;
      const values: MatchingPolicy["weights"] = {
        timeProximity: time.score,
        geographicFit: area.score,
        workerCapabilityFit: 1,
        workloadBalance: workloadFit(worker),
        urgencyCompatibility: urgencyScore,
        customerPreference: preferenceScore,
        historicalReliability: reliabilityFit(worker),
        travelCost: travelScore,
        scheduleEfficiency: efficiencyScore,
      };

      candidates.push({
        candidateId: `candidate_${input.request.requestId}_${worker.id}_${serviceStart.getTime()}`,
        requestId: input.request.requestId,
        tenantId: input.request.tenantId,
        verticalId: input.request.verticalId,
        workerId: worker.id,
        workerName: worker.displayName,
        serviceStartAt: serviceStart.toISOString(),
        serviceEndAt: serviceEnd.toISOString(),
        reservedStartAt: reservedStart.toISOString(),
        reservedEndAt: reservedEnd.toISOString(),
        score: weightedScore(policy.weights, values),
        tier: "fallback",
        reasonCodes: [
          "available",
          area.reasonCode,
          "capability_match",
          time.code,
          "buffer_fit",
          ...(area.distanceKm !== undefined && area.distanceKm <= 10 ? ["low_travel_cost"] : []),
        ],
        reasons: [
          "available",
          area.reason,
          "capability_match",
          time.reason,
          "buffer_fit",
          ...(area.distanceKm !== undefined && area.distanceKm <= 10 ? ["low_travel_cost"] : []),
        ],
      });

      if (exactStart) break;
    }

    if (
      !candidates.some((candidate) => candidate.workerId === worker.id) &&
      !exclusions.some((exclusion) => exclusion.workerId === worker.id)
    ) {
      exclude("NO_AVAILABLE_SLOT", "no_available_slot");
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.serviceStartAt !== b.serviceStartAt)
      return a.serviceStartAt.localeCompare(b.serviceStartAt);
    return a.workerId.localeCompare(b.workerId);
  });
  const limited = candidates
    .slice(0, Math.max(0, policy.maxCandidates))
    .map((candidate, index) => ({
      ...candidate,
      tier: candidateTier(index),
    }));

  return {
    requestId: input.request.requestId,
    duration,
    candidates: limited,
    bestCandidate: limited[0] ?? null,
    alternativeCandidates: limited.filter((candidate) => candidate.tier === "alternative"),
    fallbackCandidates: limited.filter((candidate) => candidate.tier === "fallback"),
    excluded: exclusions,
    policyId: policy.id,
  };
}
