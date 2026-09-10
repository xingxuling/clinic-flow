import type { Staff } from "@/types/domain";
import type { ServiceVerticalPack } from "@/verticals/types";
import type {
  ServiceDurationPolicy,
  ServiceWorker,
  WeeklyAvailabilityRule,
} from "@/scheduling/types";
import type { SchedulingRepository } from "@/scheduling/repository";

function defaultRules(
  timezone: string,
  startTime: string,
  endTime: string,
): WeeklyAvailabilityRule[] {
  return ([1, 2, 3, 4, 5, 6] as const).map((weekday) => ({
    id: `weekly-${weekday}-${startTime}`,
    weekday,
    startTime,
    endTime,
    timezone,
  }));
}

export function durationPoliciesForVertical(
  vertical: ServiceVerticalPack,
): ServiceDurationPolicy[] {
  const defaults = vertical.scheduling?.defaultBuffers ?? {};
  return vertical.services.map((service) => ({
    serviceTypeId: service.id,
    defaultDurationMin: service.scheduling?.defaultDurationMin ?? service.durationMin ?? 60,
    ...(service.scheduling?.minDurationMin === undefined
      ? {}
      : { minDurationMin: service.scheduling.minDurationMin }),
    ...(service.scheduling?.maxDurationMin === undefined
      ? {}
      : { maxDurationMin: service.scheduling.maxDurationMin }),
    travelBufferMin: service.scheduling?.travelBufferMin ?? defaults.travelBufferMin ?? 0,
    preparationBufferMin:
      service.scheduling?.preparationBufferMin ?? defaults.preparationBufferMin ?? 0,
    cleanupBufferMin: service.scheduling?.cleanupBufferMin ?? defaults.cleanupBufferMin ?? 0,
  }));
}

function workerFromStaff(input: {
  tenantId: string;
  vertical: ServiceVerticalPack;
  staff: Staff;
  index: number;
  areaId: string;
  timezone: string;
}): ServiceWorker {
  const allServices = input.vertical.services.map((service) => service.id);
  const serviceIds =
    input.index === 0
      ? allServices
      : allServices.slice(0, Math.max(1, Math.ceil(allServices.length / 2)));
  return {
    id: `worker_${input.staff.id}`,
    tenantId: input.tenantId,
    verticalId: input.vertical.id,
    displayName: input.staff.name,
    status: input.staff.active ? "active" : "inactive",
    timezone: input.timezone,
    serviceAreas: [{ areaId: input.areaId, label: "示範服務區" }],
    capabilities: [{ serviceTypeIds: serviceIds }],
    availability: {
      weeklyRules: defaultRules(
        input.timezone,
        input.index === 0 ? "09:00" : "10:00",
        input.index === 0 ? "18:00" : "19:00",
      ),
      exceptions: [],
      blocks: [],
    },
    reliabilityScore: input.index === 0 ? 0.94 : 0.86,
    supportedUrgencies:
      input.index === 0
        ? ["flexible", "normal", "urgent", "emergency"]
        : ["flexible", "normal", "urgent"],
  };
}

/** Seed only synthetic capability data for the clickable local demo. */
export function ensureDemoWorkers(input: {
  repository: SchedulingRepository;
  tenantId: string;
  vertical: ServiceVerticalPack;
  staff: readonly Staff[];
  timezone: string;
  areaId?: string;
}): ServiceWorker[] {
  const areaId = input.areaId ?? "demo-service-area";
  const existing = input.repository.listWorkers(input.tenantId, input.vertical.id);
  if (existing.length > 0) return existing;

  const assignable = input.staff.filter(
    (person) => person.active && person.role === "practitioner",
  );
  const fallback =
    assignable.length > 0 ? assignable : input.staff.filter((person) => person.active);
  const workers = fallback.slice(0, 3).map((staff, index) =>
    workerFromStaff({
      tenantId: input.tenantId,
      vertical: input.vertical,
      staff,
      index,
      areaId,
      timezone: input.timezone,
    }),
  );
  for (const worker of workers) input.repository.upsertWorker(worker);
  return input.repository.listWorkers(input.tenantId, input.vertical.id);
}
