import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockWhatsAppAdapter,
  type WhatsAppBusinessPlatformAdapter,
} from "@/integrations/messaging-adapter";
import type {
  CustomerMessagingControl,
  TenantAutomationControl,
} from "@/messaging/automation-control";
import { evaluateWhatsAppPolicy } from "@/messaging/whatsapp-policy";
import { whatsAppTemplateRegistry } from "@/messaging/whatsapp-template-registry";

function installBrowserStorage() {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal("window", {
    localStorage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "CustomEvent",
    class CustomEventMock {
      constructor(public type: string) {}
    },
  );
}

const tenantControl: TenantAutomationControl = {
  tenantId: "tenant_policy",
  agentEnabled: true,
  updatedAt: "2026-09-07T00:00:00Z",
};

function customerControl(input?: Partial<CustomerMessagingControl>): CustomerMessagingControl {
  return {
    tenantId: "tenant_policy",
    verticalId: "pet-care",
    customerId: "customer_policy",
    automationMode: "agent_allowed",
    whatsappConsent: "opted_in",
    whatsappConsentScopes: ["utility"],
    lastCustomerMessageAt: "2026-09-07T10:00:00Z",
    updatedAt: "2026-09-07T10:00:00Z",
    ...input,
  };
}

const platformAdapter: WhatsAppBusinessPlatformAdapter = {
  providerId: "test.meta.platform",
  displayName: "Meta Platform Test",
  channel: "whatsapp",
  providerKind: "whatsapp_business_platform",
  productionEligible: true,
  async send() {
    return {
      ok: true,
      providerMessageId: "wamid.test",
      providerId: "test.meta.platform",
      errorCode: null,
      sentAt: "2026-09-07T10:01:00Z",
    };
  },
};

beforeEach(() => installBrowserStorage());
afterEach(() => vi.unstubAllGlobals());

describe("WhatsApp policy gate", () => {
  it("24h 窗口内的 utility 主动消息仍要求 utility scope，但不要求 template", () => {
    const decision = evaluateWhatsAppPolicy({
      tenantId: "tenant_policy",
      adapter: platformAdapter,
      production: true,
      actor: "agent",
      initiation: "business_initiated",
      tenantControl,
      customerControl: customerControl(),
      purpose: "utility",
      now: new Date("2026-09-07T12:00:00Z"),
    });

    expect(decision.allowed).toBe(true);
    expect(decision.within24h).toBe(true);
    expect(decision.requiresTemplate).toBe(false);
  });

  it("只有 utility opt-in 时，Marketing 即使在 24h 窗口内也被阻止", () => {
    const decision = evaluateWhatsAppPolicy({
      tenantId: "tenant_policy",
      adapter: platformAdapter,
      production: true,
      actor: "agent",
      initiation: "business_initiated",
      tenantControl,
      customerControl: customerControl(),
      purpose: "marketing",
      now: new Date("2026-09-07T12:00:00Z"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockCode).toBe("WHATSAPP_CONSENT_SCOPE_REQUIRED");
  });

  it("超出 24h 后即使已有 utility opt-in，没有 template 仍被阻止", () => {
    const decision = evaluateWhatsAppPolicy({
      tenantId: "tenant_policy",
      adapter: platformAdapter,
      production: true,
      actor: "agent",
      initiation: "business_initiated",
      tenantControl,
      customerControl: customerControl({ lastCustomerMessageAt: "2026-09-05T10:00:00Z" }),
      purpose: "utility",
      now: new Date("2026-09-07T12:00:00Z"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockCode).toBe("WHATSAPP_TEMPLATE_REQUIRED");
    expect(decision.requiresTemplate).toBe(true);
  });

  it("超出 24h 后 approved utility template + matching consent 才允许发送", () => {
    const template = {
      name: "booking_reminder_v1",
      languageCode: "zh_HK",
      category: "utility" as const,
    };
    whatsAppTemplateRegistry.upsert({
      tenantId: "tenant_policy",
      ...template,
      status: "approved",
    });

    const decision = evaluateWhatsAppPolicy({
      tenantId: "tenant_policy",
      adapter: platformAdapter,
      production: true,
      actor: "agent",
      initiation: "business_initiated",
      tenantControl,
      customerControl: customerControl({ lastCustomerMessageAt: "2026-09-05T10:00:00Z" }),
      purpose: "utility",
      template,
      now: new Date("2026-09-07T12:00:00Z"),
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresTemplate).toBe(true);
  });

  it("production 模式拒绝 Mock / 普通 App 模拟 Provider", () => {
    const decision = evaluateWhatsAppPolicy({
      tenantId: "tenant_policy",
      adapter: new MockWhatsAppAdapter(),
      production: true,
      actor: "agent",
      initiation: "business_initiated",
      tenantControl,
      customerControl: customerControl(),
      purpose: "utility",
      now: new Date("2026-09-07T12:00:00Z"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockCode).toBe("WHATSAPP_BUSINESS_PLATFORM_REQUIRED");
  });

  it("客户 human-only 或商户全局暂停时 Agent 不能发送", () => {
    const humanOnly = evaluateWhatsAppPolicy({
      tenantId: "tenant_policy",
      adapter: platformAdapter,
      production: true,
      actor: "agent",
      initiation: "response",
      tenantControl,
      customerControl: customerControl({ automationMode: "human_only" }),
      now: new Date("2026-09-07T12:00:00Z"),
    });
    expect(humanOnly.blockCode).toBe("CUSTOMER_REQUESTED_HUMAN");

    const paused = evaluateWhatsAppPolicy({
      tenantId: "tenant_policy",
      adapter: platformAdapter,
      production: true,
      actor: "agent",
      initiation: "response",
      tenantControl: { ...tenantControl, agentEnabled: false },
      customerControl: customerControl(),
      now: new Date("2026-09-07T12:00:00Z"),
    });
    expect(paused.blockCode).toBe("TENANT_AGENT_PAUSED");
  });
});
