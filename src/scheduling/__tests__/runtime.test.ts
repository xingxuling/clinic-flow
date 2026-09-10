import { describe, expect, it } from "vitest";

import { InMemoryPrivateDataVault } from "@/privacy/types";
import { PrivacyBroker } from "@/privacy/broker";
import { InMemorySchedulingRepository } from "@/scheduling/repository";
import { SmartSchedulingRuntime } from "@/scheduling/runtime";
import {
  TEST_NOW,
  TEST_TENANT,
  TEST_VERTICAL,
  RecordingWorkItemSink,
  deterministicIdFactory,
  testCreateRequestInput,
  testWorker,
} from "@/scheduling/__tests__/fixtures";

function createRuntime(nowRef: { value: Date } = { value: new Date(TEST_NOW) }) {
  const repository = new InMemorySchedulingRepository();
  const vault = new InMemoryPrivateDataVault();
  const privacyBroker = new PrivacyBroker(repository, vault);
  const workItems = new RecordingWorkItemSink();
  const runtime = new SmartSchedulingRuntime(
    repository,
    privacyBroker,
    workItems,
    () => new Date(nowRef.value),
    deterministicIdFactory(),
  );
  repository.saveWorker(testWorker());
  return { repository, vault, privacyBroker, workItems, runtime, nowRef };
}

describe("Smart Scheduling runtime", () => {
  it("creates a request, holds a slot, and confirms one Job atomically", async () => {
    const { repository, vault, workItems, runtime } = createRuntime();
    const request = runtime.createRequest(
      testCreateRequestInput({ idempotencyKey: "request-key-1" }),
    );
    const matching = runtime.findCandidates(TEST_TENANT, TEST_VERTICAL, request.requestId);
    const candidate = matching?.candidates.find(
      (item) => item.startAt === "2026-09-10T10:00:00.000Z",
    );
    expect(candidate).toBeDefined();

    const held = await runtime.holdCandidate({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      requestId: request.requestId,
      candidateId: candidate!.candidateId,
      idempotencyKey: "hold-key-1",
    });
    expect(held.ok).toBe(true);
    expect(held.hold?.status).toBe("active");
    expect(new Date(held.hold!.expiresAt).getTime() - TEST_NOW.getTime()).toBe(5 * 60_000);

    const confirmed = await runtime.confirmHold({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      holdId: held.hold!.holdId,
      customerId: "customer_01",
      idempotencyKey: "booking-key-1",
      customerDisplayName: "Customer One",
      areaDetail: "Private address held in the vault",
    });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.booking?.state).toBe("CUSTOMER_CONFIRMED");
    expect(confirmed.job?.customerIdentity.publicId).toMatch(/^Customer #/);
    expect(confirmed.job?.workerIdentity.publicId).toMatch(/^Worker #/);
    expect(confirmed.conversation?.customerAgentId).toContain("customer-agent");
    expect(confirmed.conversation?.workerAgentId).toContain("worker-agent");
    expect(confirmed.notificationIntents).toHaveLength(2);
    expect(confirmed.workItems).toHaveLength(1);
    expect(workItems.items).toHaveLength(1);
    expect(repository.getHold(TEST_TENANT, TEST_VERTICAL, held.hold!.holdId)?.status).toBe(
      "confirmed",
    );
    expect(repository.getRequest(TEST_TENANT, TEST_VERTICAL, request.requestId)?.status).toBe(
      "customer_confirmed",
    );

    const context = repository.getContext(TEST_TENANT, confirmed.job!.privacyContextId);
    expect(context).toBeDefined();
    expect(context).not.toHaveProperty("areaDetail");
    expect(vault.read(context!.contextId, "exact_address")).toBe(
      "Private address held in the vault",
    );

    const duplicate = await runtime.confirmHold({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      holdId: held.hold!.holdId,
      customerId: "customer_01",
      idempotencyKey: "booking-key-1",
      customerDisplayName: "Customer One",
    });
    expect(duplicate.ok).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    expect(repository.listBookings(TEST_TENANT, TEST_VERTICAL)).toHaveLength(1);
  });

  it("exposes WORKER_NOTIFIED before SCHEDULED as notification intents complete", async () => {
    const { runtime } = createRuntime();
    const request = runtime.createRequest(testCreateRequestInput());
    const candidate = runtime.findCandidates(TEST_TENANT, TEST_VERTICAL, request.requestId)!
      .candidates[0]!;
    const hold = await runtime.holdCandidate({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      idempotencyKey: "hold-key-state",
    });
    const confirmed = await runtime.confirmHold({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      holdId: hold.hold!.holdId,
      customerId: "customer_01",
      idempotencyKey: "booking-key-state",
      customerDisplayName: "Customer One",
    });
    const workerIntent = confirmed.notificationIntents.find((item) => item.audience === "worker")!;
    const customerIntent = confirmed.notificationIntents.find(
      (item) => item.audience === "customer",
    )!;

    const workerSent = runtime.markNotificationSent({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      notificationId: workerIntent.notificationId,
    });
    expect(workerSent.ok).toBe(true);
    expect(workerSent.booking?.state).toBe("WORKER_NOTIFIED");
    const customerSent = runtime.markNotificationSent({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      notificationId: customerIntent.notificationId,
    });
    expect(customerSent.booking?.state).toBe("SCHEDULED");
  });

  it("serializes competing holds for the same candidate and prevents double booking", async () => {
    const { runtime, repository } = createRuntime();
    const request = runtime.createRequest(testCreateRequestInput());
    const candidate = runtime
      .findCandidates(TEST_TENANT, TEST_VERTICAL, request.requestId)!
      .candidates.find((item) => item.startAt === "2026-09-10T10:00:00.000Z")!;

    const results = await Promise.all([
      runtime.holdCandidate({
        tenantId: TEST_TENANT,
        verticalId: TEST_VERTICAL,
        requestId: request.requestId,
        candidateId: candidate.candidateId,
        idempotencyKey: "hold-race-a",
      }),
      runtime.holdCandidate({
        tenantId: TEST_TENANT,
        verticalId: TEST_VERTICAL,
        requestId: request.requestId,
        candidateId: candidate.candidateId,
        idempotencyKey: "hold-race-b",
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      repository.listHolds(TEST_TENANT, TEST_VERTICAL).filter((hold) => hold.status === "active"),
    ).toHaveLength(1);
  });

  it("serializes different requests competing for the same worker interval", async () => {
    const { runtime, repository } = createRuntime();
    const firstRequest = runtime.createRequest(testCreateRequestInput());
    const secondRequest = runtime.createRequest(testCreateRequestInput());
    const firstCandidate = runtime
      .findCandidates(TEST_TENANT, TEST_VERTICAL, firstRequest.requestId)!
      .candidates.find((item) => item.startAt === "2026-09-10T10:00:00.000Z")!;
    const secondCandidate = runtime
      .findCandidates(TEST_TENANT, TEST_VERTICAL, secondRequest.requestId)!
      .candidates.find((item) => item.startAt === "2026-09-10T10:00:00.000Z")!;

    const results = await Promise.all([
      runtime.holdCandidate({
        tenantId: TEST_TENANT,
        verticalId: TEST_VERTICAL,
        requestId: firstRequest.requestId,
        candidateId: firstCandidate.candidateId,
        idempotencyKey: "hold-cross-request-a",
      }),
      runtime.holdCandidate({
        tenantId: TEST_TENANT,
        verticalId: TEST_VERTICAL,
        requestId: secondRequest.requestId,
        candidateId: secondCandidate.candidateId,
        idempotencyKey: "hold-cross-request-b",
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      repository.listHolds(TEST_TENANT, TEST_VERTICAL).filter((hold) => hold.status === "active"),
    ).toHaveLength(1);
  });

  it("expires a five-minute hold and refuses confirmation after expiry", async () => {
    const clock = { value: new Date(TEST_NOW) };
    const { runtime, repository } = createRuntime(clock);
    const request = runtime.createRequest(testCreateRequestInput());
    const candidate = runtime.findCandidates(TEST_TENANT, TEST_VERTICAL, request.requestId)!
      .candidates[0]!;
    const hold = await runtime.holdCandidate({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      idempotencyKey: "hold-expiry",
    });
    clock.value = new Date(TEST_NOW.getTime() + 6 * 60_000);
    expect(runtime.releaseExpiredHolds(TEST_TENANT, TEST_VERTICAL)).toBe(1);
    expect(repository.getHold(TEST_TENANT, TEST_VERTICAL, hold.hold!.holdId)?.status).toBe(
      "expired",
    );
    const confirmed = await runtime.confirmHold({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      holdId: hold.hold!.holdId,
      customerId: "customer_01",
      idempotencyKey: "booking-expiry",
      customerDisplayName: "Customer One",
    });
    expect(confirmed.ok).toBe(false);
    expect(confirmed.code).toBe("HOLD_NOT_ACTIVE");
  });

  it("does not let a different customer confirm the hold", async () => {
    const { runtime, repository } = createRuntime();
    const request = runtime.createRequest(testCreateRequestInput());
    const candidate = runtime.findCandidates(TEST_TENANT, TEST_VERTICAL, request.requestId)!
      .candidates[0]!;
    const hold = await runtime.holdCandidate({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      idempotencyKey: "hold-customer-binding",
    });

    const result = await runtime.confirmHold({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      holdId: hold.hold!.holdId,
      customerId: "customer_attacker",
      idempotencyKey: "booking-customer-binding",
      customerDisplayName: "Attacker",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("CUSTOMER_MISMATCH");
    expect(repository.listBookings(TEST_TENANT, TEST_VERTICAL)).toHaveLength(0);
  });

  it("rolls back the scheduling repository when downstream work-item creation fails", async () => {
    const repository = new InMemorySchedulingRepository();
    const vault = new InMemoryPrivateDataVault();
    const privacyBroker = new PrivacyBroker(repository, vault);
    const runtime = new SmartSchedulingRuntime(
      repository,
      privacyBroker,
      {
        add: () => {
          throw new Error("WORK_ITEM_SINK_DOWN");
        },
      },
      () => new Date(TEST_NOW),
      deterministicIdFactory(),
    );
    repository.saveWorker(testWorker());
    const request = runtime.createRequest(testCreateRequestInput());
    const candidate = runtime.findCandidates(TEST_TENANT, TEST_VERTICAL, request.requestId)!
      .candidates[0]!;
    const hold = await runtime.holdCandidate({
      tenantId: TEST_TENANT,
      verticalId: TEST_VERTICAL,
      requestId: request.requestId,
      candidateId: candidate.candidateId,
      idempotencyKey: "hold-rollback",
    });

    await expect(
      runtime.confirmHold({
        tenantId: TEST_TENANT,
        verticalId: TEST_VERTICAL,
        holdId: hold.hold!.holdId,
        customerId: "customer_01",
        idempotencyKey: "booking-rollback",
        customerDisplayName: "Customer One",
        areaDetail: "must be removed after rollback",
      }),
    ).rejects.toThrow("WORK_ITEM_SINK_DOWN");
    expect(repository.listBookings(TEST_TENANT, TEST_VERTICAL)).toHaveLength(0);
    expect(repository.listJobs(TEST_TENANT, TEST_VERTICAL)).toHaveLength(0);
    expect(repository.getHold(TEST_TENANT, TEST_VERTICAL, hold.hold!.holdId)?.status).toBe(
      "active",
    );
    expect(repository.getRequest(TEST_TENANT, TEST_VERTICAL, request.requestId)?.status).toBe(
      "held",
    );
    expect(vault.snapshot()).toEqual({});
  });

  it("does not leak records across tenant or vertical scopes", () => {
    const { repository, runtime } = createRuntime();
    repository.saveWorker(
      testWorker({ workerId: "worker_other_tenant", tenantId: "tenant_other" }),
    );
    repository.saveWorker(
      testWorker({ workerId: "worker_other_vertical", verticalId: "pet-care" }),
    );
    const request = runtime.createRequest(testCreateRequestInput());
    expect(
      repository.listWorkers(TEST_TENANT, TEST_VERTICAL).map((worker) => worker.workerId),
    ).toEqual(["worker_01"]);
    expect(runtime.findCandidates("tenant_other", TEST_VERTICAL, request.requestId)).toBeNull();
    expect(repository.getRequest("tenant_other", TEST_VERTICAL, request.requestId)).toBeNull();
    expect(
      repository.listWorkers(TEST_TENANT, "pet-care").map((worker) => worker.workerId),
    ).not.toContain("worker_01");
  });
});
