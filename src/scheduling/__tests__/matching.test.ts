import { describe, expect, it } from "vitest";

import { calculateOccupancyInterval, matchServiceRequest } from "@/scheduling/matching";
import { DEFAULT_MATCHING_POLICY } from "@/scheduling/types";
import {
  TEST_NOW,
  TEST_TENANT,
  TEST_VERTICAL,
  testRequest,
  testWorker,
} from "@/scheduling/__tests__/fixtures";

describe("deterministic service matching", () => {
  it("requires tenant, vertical, capability, area and active status", () => {
    const result = matchServiceRequest({
      request: testRequest(),
      now: TEST_NOW,
      workers: [
        testWorker({ workerId: "inactive", status: "inactive" }),
        testWorker({ workerId: "other-tenant", tenantId: "tenant_other" }),
        testWorker({ workerId: "other-vertical", verticalId: "pet-care" }),
        testWorker({ workerId: "other-area", serviceAreaIds: ["area:other"] }),
        testWorker({ workerId: "other-capability", capabilities: [{ serviceTypeId: "plumbing" }] }),
        testWorker({ workerId: "eligible" }),
      ],
      reservations: [],
    });

    expect(result.candidates.every((candidate) => candidate.workerId === "eligible")).toBe(true);
    expect(result.excluded.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        "worker_inactive",
        "tenant_mismatch",
        "vertical_mismatch",
        "area_not_served",
        "capability_mismatch",
      ]),
    );
  });

  it("accounts for travel, preparation and cleanup buffers in availability and occupancy", () => {
    const result = matchServiceRequest({
      request: testRequest({ estimatedDurationMin: 90 }),
      workers: [testWorker()],
      reservations: [],
      now: TEST_NOW,
    });
    const exact = result.candidates.find(
      (candidate) => candidate.startAt === "2026-09-10T10:00:00.000Z",
    );
    expect(exact).toBeDefined();
    expect(exact?.endAt).toBe("2026-09-10T11:30:00.000Z");
    expect(exact?.occupancyStartAt).toBe("2026-09-10T09:35:00.000Z");
    expect(exact?.occupancyEndAt).toBe("2026-09-10T11:40:00.000Z");
    expect(exact?.reasons).toEqual(
      expect.arrayContaining(["available", "serves_area", "capability_match", "exact_time_match"]),
    );

    expect(
      calculateOccupancyInterval({
        startAt: "2026-09-10T10:00:00.000Z",
        durationMin: 90,
        worker: testWorker(),
      }),
    ).toEqual({
      startAt: "2026-09-10T10:00:00.000Z",
      endAt: "2026-09-10T11:30:00.000Z",
      occupancyStartAt: "2026-09-10T09:35:00.000Z",
      occupancyEndAt: "2026-09-10T11:40:00.000Z",
    });
  });

  it("excludes a worker when the service duration exceeds capability bounds", () => {
    const result = matchServiceRequest({
      request: testRequest({ estimatedDurationMin: 240 }),
      workers: [testWorker()],
      reservations: [],
      now: TEST_NOW,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe("duration_out_of_bounds");
  });

  it("excludes overlapping booking and active hold occupancy", () => {
    const request = testRequest();
    const result = matchServiceRequest({
      request: testRequest({
        timeWindowStart: "2026-09-10T09:30:00.000Z",
        timeWindowEnd: "2026-09-10T11:30:00.000Z",
      }),
      workers: [testWorker()],
      reservations: [
        {
          reservationId: "booking_01",
          tenantId: TEST_TENANT,
          verticalId: TEST_VERTICAL,
          workerId: "worker_01",
          kind: "booking",
          startAt: "2026-09-10T10:00:00.000Z",
          endAt: "2026-09-10T11:00:00.000Z",
          occupancyStartAt: "2026-09-10T09:45:00.000Z",
          occupancyEndAt: "2026-09-10T11:15:00.000Z",
          status: "confirmed",
        },
      ],
      now: TEST_NOW,
    });
    expect(
      result.candidates.some((candidate) => candidate.startAt === "2026-09-10T10:00:00.000Z"),
    ).toBe(false);
    expect(result.excluded.some((item) => item.reason === "booking_conflict")).toBe(true);

    const expiredHoldResult = matchServiceRequest({
      request,
      workers: [testWorker()],
      reservations: [
        {
          reservationId: "hold_01",
          tenantId: TEST_TENANT,
          verticalId: TEST_VERTICAL,
          workerId: "worker_01",
          kind: "hold",
          startAt: "2026-09-10T10:00:00.000Z",
          endAt: "2026-09-10T11:00:00.000Z",
          occupancyStartAt: "2026-09-10T09:45:00.000Z",
          occupancyEndAt: "2026-09-10T11:15:00.000Z",
          status: "held",
          expiresAt: "2026-09-10T08:59:00.000Z",
        },
      ],
      now: TEST_NOW,
    });
    expect(
      expiredHoldResult.candidates.some(
        (candidate) => candidate.startAt === "2026-09-10T10:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("ranks exact preferred time deterministically and returns configurable score reasons", () => {
    const result = matchServiceRequest({
      request: testRequest({ customerPreference: { preferredWorkerIds: ["worker_preferred"] } }),
      workers: [
        testWorker({ workerId: "worker_other", displayName: "Other", historicalReliability: 0.95 }),
        testWorker({
          workerId: "worker_preferred",
          displayName: "Preferred",
          historicalReliability: 0.7,
        }),
      ],
      reservations: [],
      policy: {
        ...DEFAULT_MATCHING_POLICY,
        maxCandidates: 1,
        weights: {
          ...DEFAULT_MATCHING_POLICY.weights,
          customerPreference: 20,
          historicalReliability: 1,
        },
      },
      now: TEST_NOW,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.workerId).toBe("worker_preferred");
    expect(result.candidates[0]?.classification).toBe("best");
    expect(result.candidates[0]?.scoreBreakdown.customerPreference).toBe(1);
    expect(result.candidates[0]?.reasons).toContain("customer_preference");
  });

  it("rejects an invalid requested time window instead of producing a candidate", () => {
    const result = matchServiceRequest({
      request: testRequest({ requestedTime: "23:00" }),
      workers: [testWorker()],
      reservations: [],
      now: TEST_NOW,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe("invalid_request_window");
  });

  it("interprets requested local time in the tenant timezone and keeps the instant deterministic", () => {
    const result = matchServiceRequest({
      request: testRequest({ timeZone: "Asia/Hong_Kong" }),
      workers: [testWorker()],
      reservations: [],
      now: TEST_NOW,
    });
    const exact = result.candidates.find(
      (candidate) => candidate.startAt === "2026-09-10T02:00:00.000Z",
    );
    expect(exact).toBeDefined();
    expect(exact?.occupancyStartAt).toBe("2026-09-10T01:35:00.000Z");
  });
});
