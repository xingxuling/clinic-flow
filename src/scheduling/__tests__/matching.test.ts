import { describe, expect, it } from "vitest";

import { matchServiceRequest } from "@/scheduling/matching";
import type { ServiceRequest, ServiceWorker } from "@/scheduling/types";

const policy = {
  serviceTypeId: "plumbing",
  defaultDurationMin: 60,
  travelBufferMin: 30,
  preparationBufferMin: 15,
  cleanupBufferMin: 15,
};

function worker(overrides: Partial<ServiceWorker> = {}): ServiceWorker {
  return {
    id: "worker-a",
    tenantId: "tenant-a",
    verticalId: "home-service",
    displayName: "Worker A",
    status: "active",
    timezone: "UTC",
    serviceAreas: [{ areaId: "area-a", label: "Area A" }],
    capabilities: [{ serviceTypeIds: ["plumbing"] }],
    availability: {
      weeklyRules: [
        { id: "tue", weekday: 2, startTime: "09:00", endTime: "18:00", timezone: "UTC" },
      ],
      exceptions: [],
      blocks: [],
    },
    ...overrides,
  };
}

function request(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    requestId: "request-1",
    tenantId: "tenant-a",
    verticalId: "home-service",
    customerId: "customer-a",
    serviceType: "plumbing",
    serviceItems: [],
    approximateArea: { areaId: "area-a", label: "Area A" },
    requestedDate: "2026-09-15",
    urgency: "normal",
    requirements: [],
    attachments: [],
    specialConstraints: [],
    privacyLevel: "standard",
    status: "DRAFT",
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("Smart Scheduling matching", () => {
  it("worker 没有可工作档期时不会匹配", () => {
    const result = matchServiceRequest({
      request: request(),
      workers: [worker({ availability: { weeklyRules: [], exceptions: [], blocks: [] } })],
      durationPolicies: [policy],
      timezone: "UTC",
      now: new Date("2026-09-10T00:00:00.000Z"),
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.excluded).toContainEqual({
      workerId: "worker-a",
      workerName: "Worker A",
      reasonCode: "NO_AVAILABLE_SLOT",
      reason: "no_available_slot",
    });
  });

  it("worker 不服务该区时不会匹配", () => {
    const result = matchServiceRequest({
      request: request(),
      workers: [worker({ serviceAreas: [{ areaId: "area-b", label: "Area B" }] })],
      durationPolicies: [policy],
      timezone: "UTC",
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.excluded[0]?.reasonCode).toBe("area_not_served");
  });

  it("服务时长超过空档时不会匹配", () => {
    const result = matchServiceRequest({
      request: request(),
      workers: [
        worker({
          availability: {
            weeklyRules: [
              { id: "tue", weekday: 2, startTime: "09:00", endTime: "10:00", timezone: "UTC" },
            ],
            exceptions: [],
            blocks: [],
          },
        }),
      ],
      durationPolicies: [{ ...policy, defaultDurationMin: 90 }],
      timezone: "UTC",
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("交通、准备和收尾 buffer 会进入完整锁定窗口", () => {
    const result = matchServiceRequest({
      request: request({ requestedTime: "10:00" }),
      workers: [worker()],
      durationPolicies: [policy],
      timezone: "UTC",
    });

    expect(result.duration.totalDurationMin).toBe(120);
    expect(result.bestCandidate?.serviceStartAt).toBe("2026-09-15T10:00:00.000Z");
    expect(result.bestCandidate?.reservedStartAt).toBe("2026-09-15T09:15:00.000Z");
    expect(result.bestCandidate?.reservedEndAt).toBe("2026-09-15T11:15:00.000Z");
    expect(result.bestCandidate?.reasons).toEqual(
      expect.arrayContaining(["available", "serves_area", "exact_time_match", "buffer_fit"]),
    );
  });

  it("候选按最接近偏好时间排序，并保留 best/alternative/fallback", () => {
    const result = matchServiceRequest({
      request: request({
        timeWindowStart: "2026-09-15T09:00:00.000Z",
        timeWindowEnd: "2026-09-15T14:00:00.000Z",
        preference: { preferredStartAt: "2026-09-15T12:00:00.000Z" },
      }),
      workers: [worker()],
      durationPolicies: [
        { ...policy, travelBufferMin: 0, preparationBufferMin: 0, cleanupBufferMin: 0 },
      ],
      timezone: "UTC",
    });

    expect(result.candidates.length).toBeGreaterThan(2);
    expect(result.bestCandidate?.serviceStartAt).toBe("2026-09-15T12:00:00.000Z");
    expect(result.bestCandidate?.tier).toBe("best");
    expect(result.alternativeCandidates.length).toBeGreaterThan(0);
    expect(result.fallbackCandidates.length).toBeGreaterThan(0);
  });

  it("tenant 和 vertical 不一致的 worker 会被硬约束排除", () => {
    const result = matchServiceRequest({
      request: request(),
      workers: [
        worker({ tenantId: "tenant-other" }),
        worker({ id: "worker-b", verticalId: "dental" }),
      ],
      durationPolicies: [policy],
      timezone: "UTC",
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.excluded.map((row) => row.reasonCode)).toEqual([
      "TENANT_MISMATCH",
      "VERTICAL_MISMATCH",
    ]);
  });
});
