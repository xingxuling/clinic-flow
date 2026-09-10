import type { ServiceVerticalPack } from "@/verticals/types";
import type { ServiceAreaRef, Worker } from "@/scheduling/types";

export function demoAreaFor(tenantId: string, label: string): ServiceAreaRef {
  return {
    areaId: `area:${tenantId}:primary`,
    label: label || "主要服务区",
  };
}

function weeklyAvailability() {
  return [
    { weekday: 1 as const, startTime: "09:00", endTime: "18:00" },
    { weekday: 2 as const, startTime: "09:00", endTime: "18:00" },
    { weekday: 3 as const, startTime: "09:00", endTime: "18:00" },
    { weekday: 4 as const, startTime: "09:00", endTime: "18:00" },
    { weekday: 5 as const, startTime: "09:00", endTime: "18:00" },
    { weekday: 6 as const, startTime: "10:00", endTime: "16:00" },
  ];
}

export function demoWorkersFor(
  tenantId: string,
  vertical: ServiceVerticalPack,
  area: ServiceAreaRef,
): Worker[] {
  const capabilities = vertical.services.map((service) => ({
    serviceTypeId: service.id,
    ...(service.durationMin === undefined ? {} : { defaultDurationMin: service.durationMin }),
  }));
  return [
    {
      workerId: `worker:${tenantId}:a`,
      tenantId,
      verticalId: vertical.id,
      displayName: "服务人员 A",
      status: "active",
      serviceAreaIds: [area.areaId],
      capabilities,
      weeklyAvailability: weeklyAvailability(),
      availabilityExceptions: [],
      defaultTravelBufferMin: 10,
      preparationBufferMin: 10,
      cleanupBufferMin: 10,
      rating: 4.9,
      historicalReliability: 0.96,
    },
    {
      workerId: `worker:${tenantId}:b`,
      tenantId,
      verticalId: vertical.id,
      displayName: "服务人员 B",
      status: "active",
      serviceAreaIds: [area.areaId],
      capabilities,
      weeklyAvailability: weeklyAvailability(),
      availabilityExceptions: [],
      defaultTravelBufferMin: 25,
      preparationBufferMin: 5,
      cleanupBufferMin: 10,
      rating: 4.7,
      historicalReliability: 0.89,
    },
  ];
}
