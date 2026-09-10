import { describe, expect, it } from "vitest";

import { InMemorySchedulingRepository } from "@/scheduling/repository";
import { ServiceSchedulingRuntime } from "@/scheduling/runtime";
import type { ServiceRequest, ServiceWorker } from "@/scheduling/types";

const now = new Date("2026-09-10T00:00:00.000Z");
const durationPolicies = [
  {
    serviceTypeId: "service-a",
    defaultDurationMin: 60,
    travelBufferMin: 0,
    preparationBufferMin: 0,
    cleanupBufferMin: 0,
  },
];

function makeWorker(): ServiceWorker {
  return {
    id: "worker-a",
    tenantId: "tenant-a",
    verticalId: "home-service",
    displayName: "Worker A",
    status: "active",
    timezone: "UTC",
    serviceAreas: [{ areaId: "area-a", label: "Area A" }],
    capabilities: [{ serviceTypeIds: ["service-a"] }],
    availability: {
      weeklyRules: [
        { id: "tue", weekday: 2, startTime: "09:00", endTime: "18:00", timezone: "UTC" },
      ],
      exceptions: [],
      blocks: [],
    },
  };
}

function makeRequest(
  runtime: ServiceSchedulingRuntime,
  customerId: string,
  requestId: string,
): ServiceRequest {
  const request = runtime.createRequest({
    tenantId: "tenant-a",
    verticalId: "home-service",
    customerId,
    serviceType: "service-a",
    approximateArea: { areaId: "area-a", label: "Area A" },
    requestedDate: "2026-09-15",
    requestedTime: "10:00",
    now: now.toISOString(),
  });
  return { ...request, requestId };
}

function runtimeWithRequest(customerId = "customer-a") {
  const repository = new InMemorySchedulingRepository();
  repository.upsertWorker(makeWorker());
  const runtime = new ServiceSchedulingRuntime(repository, {
    policy: { holdDurationMin: 5, slotIncrementMin: 30 },
  });
  const created = runtime.createRequest({
    tenantId: "tenant-a",
    verticalId: "home-service",
    customerId,
    serviceType: "service-a",
    approximateArea: { areaId: "area-a", label: "Area A" },
    requestedDate: "2026-09-15",
    requestedTime: "10:00",
    now: now.toISOString(),
  });
  const match = runtime.findMatches({
    tenantId: "tenant-a",
    verticalId: "home-service",
    requestId: created.requestId,
    durationPolicies,
    timezone: "UTC",
    now,
  });
  return { repository, runtime, request: created, candidate: match.bestCandidate! };
}

describe("Schedule Hold → Confirm → Lock", () => {
  it("可以成功 Hold，并写入过期时间", () => {
    const { runtime, request, candidate } = runtimeWithRequest();
    const receipt = runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-key-1",
      now,
    });

    expect(receipt.ok).toBe(true);
    expect(receipt.hold?.status).toBe("ACTIVE");
    expect(receipt.hold?.expiresAt).toBe("2026-09-10T00:05:00.000Z");
    expect(runtime.getRequest("tenant-a", "home-service", request.requestId)?.status).toBe("HELD");
  });

  it("Hold 到期后自动释放，并使 request 进入 EXPIRED", () => {
    const { repository, runtime, request, candidate } = runtimeWithRequest();
    const held = runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-key-expire",
      now,
    });

    expect(held.ok).toBe(true);
    expect(runtime.expireHolds(new Date("2026-09-10T00:06:00.000Z"))).toBe(1);
    expect(repository.getHold("tenant-a", "home-service", held.hold!.holdId)?.status).toBe(
      "EXPIRED",
    );
    expect(runtime.getRequest("tenant-a", "home-service", request.requestId)?.status).toBe(
      "EXPIRED",
    );
  });

  it("同一 slot 不能被两个客户确认", () => {
    const first = runtimeWithRequest("customer-a");
    const firstHold = first.runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: first.request.requestId,
      candidateId: first.candidate.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-first",
      now,
    });
    const firstConfirmation = first.runtime.confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: firstHold.hold!.holdId,
      idempotencyKey: "confirm-first",
      now: new Date("2026-09-10T00:01:00.000Z"),
    });
    expect(firstConfirmation.ok).toBe(true);

    const secondRuntime = new ServiceSchedulingRuntime(first.repository, {
      policy: { holdDurationMin: 5, slotIncrementMin: 30 },
    });
    const secondRequest = secondRuntime.createRequest({
      tenantId: "tenant-a",
      verticalId: "home-service",
      customerId: "customer-b",
      serviceType: "service-a",
      approximateArea: { areaId: "area-a" },
      requestedDate: "2026-09-15",
      requestedTime: "10:00",
      now: now.toISOString(),
    });
    const secondMatch = secondRuntime.findMatches({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: secondRequest.requestId,
      durationPolicies,
      timezone: "UTC",
      now,
    });
    expect(secondMatch.candidates).toHaveLength(0);
    expect(secondMatch.excluded.some((row) => row.reasonCode === "NO_AVAILABLE_SLOT")).toBe(true);
  });

  it("重复 Confirm 只返回原 booking，不重复建立通知或 booking", () => {
    const { repository, runtime, request, candidate } = runtimeWithRequest();
    const held = runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-repeat",
      now,
    });
    const first = runtime.confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: held.hold!.holdId,
      idempotencyKey: "confirm-repeat",
      now: new Date("2026-09-10T00:01:00.000Z"),
    });
    const second = new ServiceSchedulingRuntime(repository, {
      policy: { holdDurationMin: 5, slotIncrementMin: 30 },
    }).confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: held.hold!.holdId,
      idempotencyKey: "confirm-repeat",
      now: new Date("2026-09-10T00:02:00.000Z"),
    });

    expect(first.status).toBe("scheduled");
    expect(first.workItemId).toBeTruthy();
    expect(second.status).toBe("duplicate");
    expect(second.booking?.bookingId).toBe(first.booking?.bookingId);
    expect(repository.listBookings("tenant-a", "home-service")).toHaveLength(1);
  });

  it("相同确认幂等键不能在同一 scope 建立第二个 booking", () => {
    const first = runtimeWithRequest("customer-a");
    const firstHold = first.runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: first.request.requestId,
      candidateId: first.candidate.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-idempotency-scope",
      now,
    });
    const firstConfirmation = first.runtime.confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: firstHold.hold!.holdId,
      idempotencyKey: "confirm-idempotency-scope",
      now: new Date("2026-09-10T00:01:00.000Z"),
    });

    expect(firstConfirmation.ok).toBe(true);

    const duplicate = new ServiceSchedulingRuntime(first.repository, {
      policy: { holdDurationMin: 5, slotIncrementMin: 30 },
    }).confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: firstHold.hold!.holdId,
      idempotencyKey: "confirm-idempotency-scope",
      now: new Date("2026-09-10T00:02:00.000Z"),
    });

    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.booking?.bookingId).toBe(firstConfirmation.booking?.bookingId);
    expect(first.repository.listBookings("tenant-a", "home-service")).toHaveLength(1);
  });

  it("通知队列失败时不返回成功，并保留 FAILED 恢复状态", () => {
    const repository = new InMemorySchedulingRepository();
    repository.upsertWorker(makeWorker());
    const notificationSink = {
      failNext: false,
      enqueue() {
        this.failNext = false;
        return { ok: false, notificationId: null, errorCode: "NOTIFICATION_QUEUE_FAILED" };
      },
    };
    const runtime = new ServiceSchedulingRuntime(repository, {
      notificationSink,
      policy: { holdDurationMin: 5 },
    });
    const request = runtime.createRequest({
      tenantId: "tenant-a",
      verticalId: "home-service",
      customerId: "customer-a",
      serviceType: "service-a",
      approximateArea: { areaId: "area-a" },
      requestedDate: "2026-09-15",
      requestedTime: "10:00",
      now: now.toISOString(),
    });
    const match = runtime.findMatches({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: request.requestId,
      durationPolicies,
      timezone: "UTC",
      now,
    });
    const held = runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: request.requestId,
      candidateId: match.bestCandidate!.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-fail",
      now,
    });
    const result = runtime.confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: held.hold!.holdId,
      idempotencyKey: "confirm-fail",
      now,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOTIFICATION_QUEUE_FAILED");
    expect(result.booking?.status).toBe("FAILED");
    expect(repository.getRequest("tenant-a", "home-service", request.requestId)?.status).toBe(
      "FAILED",
    );
  });

  it("创建 Work Item 失败时不返回虚假排程成功", () => {
    const { repository, request, candidate } = runtimeWithRequest();
    const runtime = new ServiceSchedulingRuntime(repository, {
      workItemSink: {
        createBookingWorkItem: () => ({
          ok: false,
          duplicate: false,
          workItemId: null,
          errorCode: "WORK_ITEM_STORE_FAILED",
        }),
      },
      policy: { holdDurationMin: 5, slotIncrementMin: 30 },
    });
    const held = runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-work-item-fail",
      now,
    });
    const result = runtime.confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: held.hold!.holdId,
      idempotencyKey: "confirm-work-item-fail",
      now: new Date("2026-09-10T00:01:00.000Z"),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("WORK_ITEM_CREATE_FAILED");
    expect(result.booking?.status).toBe("FAILED");
  });

  it("失败确认的同一幂等键重放仍保持失败，不伪造 duplicate success", () => {
    const { repository, request, candidate } = runtimeWithRequest();
    const notificationSink = {
      enqueue: () => ({
        ok: false,
        notificationId: null,
        errorCode: "NOTIFICATION_QUEUE_FAILED",
      }),
    };
    const runtime = new ServiceSchedulingRuntime(repository, {
      notificationSink,
      policy: { holdDurationMin: 5, slotIncrementMin: 30 },
    });
    const held = runtime.holdCandidate({
      tenantId: "tenant-a",
      verticalId: "home-service",
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      durationPolicies,
      timezone: "UTC",
      idempotencyKey: "hold-failed-replay",
      now,
    });
    const first = runtime.confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: held.hold!.holdId,
      idempotencyKey: "confirm-failed-replay",
      now,
    });
    const replay = new ServiceSchedulingRuntime(repository, {
      notificationSink,
      policy: { holdDurationMin: 5, slotIncrementMin: 30 },
    }).confirmHold({
      tenantId: "tenant-a",
      verticalId: "home-service",
      holdId: held.hold!.holdId,
      idempotencyKey: "confirm-failed-replay",
      now: new Date("2026-09-10T00:01:00.000Z"),
    });

    expect(first.ok).toBe(false);
    expect(replay.ok).toBe(false);
    expect(replay.status).toBe("failed");
    expect(replay.code).toBe("CONFIRMATION_FAILED");
    expect(repository.listBookings("tenant-a", "home-service")).toHaveLength(1);
  });
});
