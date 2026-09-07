import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceConversationIngestRuntime } from "@/conversations/ingest-runtime";
import { BrowserServiceConversationRepository } from "@/conversations/repository";
import type { ServiceTenant } from "@/core/tenant";
import { MockWhatsAppAdapter } from "@/integrations/messaging-adapter";
import { getVerticalPack } from "@/verticals/registry";

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

const tenant: ServiceTenant = {
  id: "tenant_service_demo",
  verticalId: "pet-care",
  displayName: "Service Demo",
  district: "香港",
  phone: "+852 3000 0000",
  timezone: "Asia/Hong_Kong",
  reminderLeadHours: [24],
  channels: [{ channel: "whatsapp", connected: true, note: "demo" }],
  privacy: { retentionDays: 180, maskCustomerPhoneInLists: true },
};

beforeEach(() => installBrowserStorage());
afterEach(() => vi.unstubAllGlobals());

describe("ServiceConversationIngestRuntime", () => {
  it("FAQ 自动回复成功时只把真实发送成功的 Agent 消息写入 Conversation", async () => {
    const repository = new BrowserServiceConversationRepository();
    const runtime = new ServiceConversationIngestRuntime(repository);
    const adapter = new MockWhatsAppAdapter();
    const vertical = getVerticalPack("pet-care")!;

    const receipt = await runtime.ingest({
      tenant: { ...tenant, verticalId: vertical.id },
      vertical,
      customerName: "陈先生",
      messagingAdapter: adapter,
      message: {
        providerMessageId: "wa_in_pet_faq_001",
        tenantId: tenant.id,
        customerId: "customer_pet_01",
        channel: "whatsapp",
        text: "几点开门？",
        receivedAt: "2026-09-07T12:00:00+08:00",
      },
    });

    expect(receipt.persisted).toBe(true);
    expect(receipt.frontdesk?.autoReplyReceipt?.ok).toBe(true);
    expect(receipt.conversation?.messages.map((message) => message.from)).toEqual(["customer", "agent"]);
    expect(receipt.conversation?.state).toBe("agent_handling");
    expect(receipt.conversation?.unread).toBe(false);
    expect(adapter.snapshot()).toHaveLength(1);
  });

  it("同一个 providerMessageId 重放时不再调用 Frontdesk / Messaging send", async () => {
    const repository = new BrowserServiceConversationRepository();
    const runtime = new ServiceConversationIngestRuntime(repository);
    const adapter = new MockWhatsAppAdapter();
    const vertical = getVerticalPack("pet-care")!;
    const input = {
      tenant: { ...tenant, verticalId: vertical.id },
      vertical,
      customerName: "陈先生",
      messagingAdapter: adapter,
      message: {
        providerMessageId: "wa_in_idempotent_001",
        tenantId: tenant.id,
        customerId: "customer_pet_02",
        channel: "whatsapp" as const,
        text: "几点开门？",
        receivedAt: "2026-09-07T12:10:00+08:00",
      },
    };

    const first = await runtime.ingest(input);
    const second = await runtime.ingest(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.frontdesk).toBeNull();
    expect(adapter.snapshot()).toHaveLength(1);
    expect(repository.list(tenant.id, vertical.id)[0]?.messages).toHaveLength(2);
  });

  it("家居漏电／冒烟只保存原话并进入 waiting_human，同时保留安全证据", async () => {
    const repository = new BrowserServiceConversationRepository();
    const runtime = new ServiceConversationIngestRuntime(repository);
    const adapter = new MockWhatsAppAdapter();
    const vertical = getVerticalPack("home-service")!;

    const receipt = await runtime.ingest({
      tenant: { ...tenant, verticalId: vertical.id },
      vertical,
      customerName: "李女士",
      messagingAdapter: adapter,
      message: {
        providerMessageId: "wa_in_home_safety_001",
        tenantId: tenant.id,
        customerId: "customer_home_01",
        channel: "whatsapp",
        text: "个插苏好似漏电，仲有冒烟",
        receivedAt: "2026-09-07T12:20:00+08:00",
      },
    });

    expect(receipt.state).toBe("waiting_human");
    expect(receipt.conversation?.messages).toHaveLength(1);
    expect(receipt.conversation?.safetySignal?.quote).toContain("漏电");
    expect(receipt.conversation?.safetySignal?.matchedKeywords).toEqual(
      expect.arrayContaining(["漏电", "冒烟"]),
    );
    expect(receipt.conversation?.unread).toBe(true);
    expect(adapter.snapshot()).toHaveLength(0);
  });

  it("有自动回复答案但没有匹配渠道 Adapter 时 fail-closed 到人工，而不是静默丢消息", async () => {
    const repository = new BrowserServiceConversationRepository();
    const runtime = new ServiceConversationIngestRuntime(repository);
    const adapter = new MockWhatsAppAdapter();
    const vertical = getVerticalPack("pet-care")!;

    const receipt = await runtime.ingest({
      tenant: { ...tenant, verticalId: vertical.id },
      vertical,
      customerName: "王先生",
      messagingAdapter: adapter,
      message: {
        providerMessageId: "web_in_no_adapter_001",
        tenantId: tenant.id,
        customerId: "customer_pet_web_01",
        channel: "web",
        text: "几点开门？",
        receivedAt: "2026-09-07T12:30:00+08:00",
      },
    });

    expect(receipt.frontdesk?.decision.autoSendAllowed).toBe(true);
    expect(receipt.frontdesk?.autoReplyAttempted).toBe(false);
    expect(receipt.state).toBe("waiting_human");
    expect(receipt.conversation?.messages).toHaveLength(1);
    expect(adapter.snapshot()).toHaveLength(0);
  });

  it("tenant mismatch 不持久化到任何 Service Conversation", async () => {
    const repository = new BrowserServiceConversationRepository();
    const runtime = new ServiceConversationIngestRuntime(repository);
    const adapter = new MockWhatsAppAdapter();
    const vertical = getVerticalPack("pet-care")!;

    const receipt = await runtime.ingest({
      tenant: { ...tenant, verticalId: vertical.id },
      vertical,
      customerName: "跨租户",
      messagingAdapter: adapter,
      message: {
        providerMessageId: "wa_cross_tenant_001",
        tenantId: "other_tenant",
        customerId: "customer_other",
        channel: "whatsapp",
        text: "几点开门？",
        receivedAt: "2026-09-07T12:40:00+08:00",
      },
    });

    expect(receipt.persisted).toBe(false);
    expect(receipt.errors).toContain("TENANT_MISMATCH_NOT_PERSISTED");
    expect(repository.list(tenant.id, vertical.id)).toEqual([]);
    expect(adapter.snapshot()).toHaveLength(0);
  });
});
