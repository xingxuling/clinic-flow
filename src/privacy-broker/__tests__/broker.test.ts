import { describe, expect, it } from "vitest";

import { PrivacyBroker } from "@/privacy-broker/broker";

function createBroker() {
  const broker = new PrivacyBroker();
  const context = broker.createJobContext({
    jobId: "job-1",
    tenantId: "tenant-a",
    verticalId: "home-service",
    customerId: "customer-a",
    workerId: "worker-a",
    serviceSummary: "家居清洁",
    approximateArea: "area-a",
    schedule: {
      serviceStartAt: "2026-09-15T10:00:00.000Z",
      serviceEndAt: "2026-09-15T12:00:00.000Z",
    },
    preparation: ["请清理入口附近杂物"],
    sensitiveData: {
      customerPhone: "+852 9000 0001",
      workerPhone: "+852 9000 0002",
      exactAddress: "1 Example Street, Unit 2",
      entryInstruction: "到达后按门铃",
    },
    now: "2026-09-10T00:00:00.000Z",
  });
  return { broker, context };
}

describe("Privacy Broker", () => {
  it("Job identity 使用别名，Customer/Worker view 不包含私人电话", () => {
    const { broker, context } = createBroker();
    expect(context.customerIdentity.alias).toMatch(/^Customer #/);
    expect(context.workerIdentity.alias).toMatch(/^Worker #/);

    const workerView = broker.viewForParty({
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      party: "worker",
      partyId: "worker-a",
      serviceSummary: "伪造服务摘要",
      approximateArea: "伪造区域",
      schedule: {
        serviceStartAt: "2026-09-15T10:00:00.000Z",
        serviceEndAt: "2026-09-15T12:00:00.000Z",
      },
    });

    expect(workerView?.serviceSummary).toBe("家居清洁");
    expect(workerView?.approximateArea).toBe("area-a");
    expect(workerView).not.toHaveProperty("customerPhone");
    expect(workerView).not.toHaveProperty("workerPhone");
    expect(JSON.stringify(workerView)).not.toContain("9000 0001");
  });

  it("未到披露阶段不能读取完整地址，near service + customer consent 才能读取", () => {
    const { broker } = createBroker();
    const base = {
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      requester: "worker" as const,
      requesterId: "worker-a",
      target: "worker" as const,
      capability: "job.exact_address.read" as const,
      purpose: "service_execution" as const,
    };
    const matching = broker.requestDisclosure({ ...base, stage: "matching" });
    expect(matching.allowed).toBe(false);
    expect(matching.blockCode).toBe("EXACT_ADDRESS_PURPOSE_REQUIRED");

    const nearWithoutConsent = broker.requestDisclosure({ ...base, stage: "near_service" });
    expect(nearWithoutConsent.allowed).toBe(false);
    expect(nearWithoutConsent.blockCode).toBe("CUSTOMER_CONSENT_REQUIRED");

    const nearWithConsent = broker.requestDisclosure({
      ...base,
      stage: "near_service",
      customerConsented: true,
    });
    expect(nearWithConsent.allowed).toBe(true);
    expect(nearWithConsent.value).toBe("1 Example Street, Unit 2");
  });

  it("Customer/Worker 请求对方私人电话时 fail closed", () => {
    const { broker } = createBroker();
    const customerRequest = broker.requestDisclosure({
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      requester: "customer",
      requesterId: "customer-a",
      target: "worker",
      capability: "job.private_phone.read",
      stage: "manual",
      purpose: "support",
    });
    const workerRequest = broker.requestDisclosure({
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      requester: "worker",
      requesterId: "worker-a",
      target: "customer",
      capability: "job.private_phone.read",
      stage: "manual",
      purpose: "support",
    });

    expect(customerRequest.allowed).toBe(false);
    expect(workerRequest.allowed).toBe(false);
    expect(customerRequest.blockCode).toBe("PRIVATE_PHONE_DISCLOSURE_FORBIDDEN");
    expect(workerRequest.blockCode).toBe("PRIVATE_PHONE_DISCLOSURE_FORBIDDEN");
  });

  it("跨 tenant/vertical 的读取被拒绝，审计不保存敏感原文", () => {
    const { broker } = createBroker();
    const result = broker.requestDisclosure({
      jobId: "job-1",
      tenantId: "tenant-other",
      verticalId: "home-service",
      requester: "platform_agent",
      requesterId: "agent-1",
      target: "worker",
      capability: "job.channel_endpoint.use",
      stage: "matching",
      purpose: "communication",
    });

    expect(result.allowed).toBe(false);
    expect(result.blockCode).toBe("TENANT_OR_VERTICAL_MISMATCH");
    expect(
      JSON.stringify(broker.listAuditEvents({ tenantId: "tenant-a", verticalId: "home-service" })),
    ).not.toContain("9000 0001");
  });

  it("平台 Agent 只能取得 opaque endpoint ref，不能取得手机号", () => {
    const { broker } = createBroker();
    const result = broker.requestDisclosure({
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      requester: "platform_agent",
      requesterId: "agent:job-1",
      target: "customer",
      capability: "job.channel_endpoint.use",
      stage: "matching",
      purpose: "communication",
    });

    expect(result.allowed).toBe(true);
    expect(result.value).toBe("job-endpoint:job-1:customer");
    expect(String(result.value)).not.toContain("9000");
  });

  it("平台 Agent 不能因 near_service 阶段取得精确地址", () => {
    const { broker } = createBroker();
    const result = broker.requestDisclosure({
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      requester: "platform_agent",
      requesterId: "agent:job-1",
      target: "worker",
      capability: "job.exact_address.read",
      stage: "near_service",
      purpose: "service_execution",
      customerConsented: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockCode).toBe("EXACT_ADDRESS_PURPOSE_REQUIRED");
  });

  it("同一 job id 不能跨参与者或 scope 覆盖原隐私上下文", () => {
    const { broker } = createBroker();
    expect(() =>
      broker.createJobContext({
        jobId: "job-1",
        tenantId: "tenant-other",
        verticalId: "home-service",
        customerId: "customer-a",
        workerId: "worker-a",
        serviceSummary: "不应覆盖",
      }),
    ).toThrow("PRIVACY_JOB_SCOPE_CONFLICT");
  });

  it("不接受伪装成规则的跨 Job 电话读取请求", () => {
    const { broker } = createBroker();
    const result = broker.requestDisclosure({
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      requester: "platform_agent",
      requesterId: "agent:job-1",
      target: "customer",
      capability: "job.private_phone.read",
      stage: "manual",
      purpose: "support",
    });

    expect(result.allowed).toBe(false);
    expect(result.blockCode).toBe("PRIVATE_PHONE_DISCLOSURE_FORBIDDEN");
    expect(JSON.stringify(result)).not.toContain("9000 000");
  });

  it("平台 Agent 必须绑定当前 Job，不能借 Job ID 冒充其他 Agent 上下文", () => {
    const { broker } = createBroker();
    const result = broker.requestDisclosure({
      jobId: "job-1",
      tenantId: "tenant-a",
      verticalId: "home-service",
      requester: "platform_agent",
      requesterId: "agent:job-other",
      target: "customer",
      capability: "job.channel_endpoint.use",
      stage: "matching",
      purpose: "communication",
    });

    expect(result.allowed).toBe(false);
    expect(result.blockCode).toBe("PARTICIPANT_SCOPE_REQUIRED");
  });
});
