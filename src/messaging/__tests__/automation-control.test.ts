import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserMessagingAutomationControlRepository } from "@/messaging/automation-control";

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

beforeEach(() => installBrowserStorage());
afterEach(() => vi.unstubAllGlobals());

describe("Messaging automation controls", () => {
  it("记录 WhatsApp opt-in 不会把客户从 human-only 自动恢复成 Agent", () => {
    const repo = new BrowserMessagingAutomationControlRepository();
    const base = {
      tenantId: "tenant_control",
      verticalId: "pet-care",
      customerId: "customer_control",
    };

    repo.setHumanOnly({
      ...base,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      updatedBy: "customer",
    });
    repo.optInWhatsApp({
      ...base,
      scopes: ["utility"],
      updatedBy: "staff_01",
    });

    const control = repo.getCustomer(base.tenantId, base.verticalId, base.customerId);
    expect(control.whatsappConsent).toBe("opted_in");
    expect(control.whatsappConsentScopes).toEqual(["utility"]);
    expect(control.automationMode).toBe("human_only");
  });

  it("只有显式 resumeAgent 才重新开放 Agent", () => {
    const repo = new BrowserMessagingAutomationControlRepository();
    const base = {
      tenantId: "tenant_control",
      verticalId: "pet-care",
      customerId: "customer_control",
    };

    repo.setHumanOnly({ ...base, reason: "CUSTOMER_REQUESTED_HUMAN" });
    expect(repo.getCustomer(base.tenantId, base.verticalId, base.customerId).automationMode).toBe("human_only");

    repo.resumeAgent({ ...base, updatedBy: "staff_01" });
    expect(repo.getCustomer(base.tenantId, base.verticalId, base.customerId).automationMode).toBe("agent_allowed");
  });
});
