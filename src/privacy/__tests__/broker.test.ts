import { describe, expect, it } from "vitest";

import { PrivacyBroker } from "@/privacy/broker";
import { InMemoryPrivateDataVault, InMemoryPrivacyRepository } from "@/privacy/types";

const NOW = new Date("2026-09-10T09:00:00.000Z");

function createBroker() {
  const repository = new InMemoryPrivacyRepository();
  const vault = new InMemoryPrivateDataVault();
  const broker = new PrivacyBroker(repository, vault);
  const context = broker.createContext({
    tenantId: "tenant_demo",
    verticalId: "home-service",
    jobId: "job_1234",
    customerId: "customer_01",
    workerId: "worker_01",
    customerDisplayName: "Customer One",
    workerDisplayName: "Worker One",
    serviceType: "cleaning",
    approximateAreaLabel: "Central service area",
    areaDetail: "Private exact address",
    startAt: "2026-09-10T10:00:00.000Z",
    endAt: "2026-09-10T11:00:00.000Z",
    requirements: ["bring eco-friendly supplies"],
    now: NOW,
  });
  return { broker, repository, vault, context };
}

describe("Privacy Broker progressive disclosure", () => {
  it("returns only job-scoped public data during confirmation", () => {
    const { broker, context } = createBroker();
    const view = broker.getScopedView({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_01",
      stage: "confirmed",
      now: NOW,
    });
    expect(view?.publicIdentity).toBe("Customer #1234");
    expect(view?.serviceType).toBe("cleaning");
    expect(view?.approximateArea).toBe("Central service area");
    expect(view?.exactAddress).toBeUndefined();
    expect(view).not.toHaveProperty("areaDetail");
    expect(view?.disclosedCapabilities).not.toContain("job.exact_address");
  });

  it("requires near-service stage, purpose and consent before exact address access", () => {
    const { broker, context, repository, vault } = createBroker();
    const blocked = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_01",
      capability: "job.exact_address",
      purpose: "job_operations",
      stage: "confirmed",
      consented: true,
      now: NOW,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.code).toBe("CAPABILITY_NOT_ALLOWED");

    expect(
      broker.setStage({
        tenantId: "tenant_demo",
        verticalId: "home-service",
        contextId: context.contextId,
        stage: "near_service",
        now: NOW,
      })?.stage,
    ).toBe("near_service");

    const purposeBlocked = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_01",
      capability: "job.exact_address",
      purpose: "job_operations",
      stage: "near_service",
      consented: true,
      now: NOW,
    });
    expect(purposeBlocked.code).toBe("PURPOSE_REQUIRED");

    const consentBlocked = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_01",
      capability: "job.exact_address",
      purpose: "active_service_delivery",
      stage: "near_service",
      consented: false,
      now: NOW,
    });
    expect(consentBlocked.code).toBe("CONSENT_REQUIRED");

    expect(
      broker.recordCustomerConsent({
        tenantId: "tenant_demo",
        verticalId: "home-service",
        contextId: context.contextId,
        customerId: "customer_01",
        actorSubjectId: "customer_01",
        capability: "job.exact_address",
        purpose: "active_service_delivery",
        now: NOW,
      })?.customerId,
    ).toBe("customer_01");

    const allowed = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_01",
      capability: "job.exact_address",
      purpose: "active_service_delivery",
      stage: "near_service",
      consented: true,
      now: NOW,
    });
    expect(allowed).toMatchObject({
      allowed: true,
      code: "ALLOWED",
      value: "Private exact address",
    });
    expect(
      repository
        .listAudit("tenant_demo", "home-service", context.contextId)
        .map((event) => event.decision),
    ).toEqual(["blocked", "blocked", "blocked", "allowed", "allowed"]);
    expect(vault.read(context.contextId, "customer_phone")).toBeNull();
  });

  it("never discloses private phone numbers under the default policy", () => {
    const { broker, context, vault } = createBroker();
    vault.set(context.contextId, "worker_phone", "+85200000000");
    const result = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "customer_agent",
      viewerSubjectId: "customer_01",
      capability: "worker.phone",
      purpose: "contact_exchange",
      consented: true,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CAPABILITY_NOT_ALLOWED");
    expect(result.value).toBeUndefined();
  });

  it("fails closed for wrong participant, tenant and vertical", () => {
    const { broker, context, repository } = createBroker();
    const wrongParticipant = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_attacker",
      capability: "job.service",
      purpose: "job_operations",
      now: NOW,
    });
    expect(wrongParticipant.code).toBe("VIEWER_NOT_PARTICIPANT");

    const wrongVertical = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "pet-care",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_01",
      capability: "job.service",
      purpose: "job_operations",
      now: NOW,
    });
    expect(wrongVertical.code).toBe("VERTICAL_MISMATCH");
    expect(
      broker.getScopedView({
        tenantId: "tenant_other",
        verticalId: "home-service",
        contextId: context.contextId,
        viewer: "staff",
      }),
    ).toBeNull();
    expect(repository.listAudit("tenant_demo", "home-service", context.contextId)).toHaveLength(1);
    expect(repository.listAudit("tenant_demo", "pet-care", context.contextId)).toHaveLength(1);
  });

  it("expires the temporary job identity", () => {
    const { broker, context } = createBroker();
    const later = new Date(NOW.getTime() + 31 * 86_400_000);
    const result = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "customer",
      viewerSubjectId: "customer_01",
      capability: "job.service",
      purpose: "job_operations",
      now: later,
    });
    expect(result.code).toBe("CONTEXT_NOT_FOUND");
  });

  it("does not let a caller bypass the lifecycle or forge customer consent", () => {
    const { broker, context } = createBroker();
    const stageOverride = broker.requestAccess({
      tenantId: "tenant_demo",
      verticalId: "home-service",
      contextId: context.contextId,
      viewer: "worker_agent",
      viewerSubjectId: "worker_01",
      capability: "job.service",
      purpose: "job_operations",
      stage: "near_service",
      now: NOW,
    });
    expect(stageOverride.code).toBe("STAGE_MISMATCH");
    expect(
      broker.recordCustomerConsent({
        tenantId: "tenant_demo",
        verticalId: "home-service",
        contextId: context.contextId,
        customerId: "customer_01",
        actorSubjectId: "worker_01",
        capability: "job.exact_address",
        purpose: "active_service_delivery",
        now: NOW,
      }),
    ).toBeNull();
    expect(
      broker.setStage({
        tenantId: "tenant_demo",
        verticalId: "pet-care",
        contextId: context.contextId,
        stage: "near_service",
        now: NOW,
      }),
    ).toBeNull();
  });
});
