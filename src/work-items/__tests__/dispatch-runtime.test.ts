import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserServiceConversationRepository } from "@/conversations/repository";
import type { ServiceCustomer } from "@/customers/types";
import type { MessagingAdapter } from "@/integrations/messaging-adapter";
import { MockWhatsAppAdapter } from "@/integrations/messaging-adapter";
import { messagingAutomationControlRepository } from "@/messaging/automation-control";
import { getVerticalPack } from "@/verticals/registry";
import { ServiceWorkItemDispatchRuntime } from "@/work-items/dispatch-runtime";
import { createFollowUpWorkItem } from "@/work-items/follow-up-work-item";
import { BrowserServiceWorkItemRepository, serviceWorkItemRepository } from "@/work-items/repository";

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

const customer: ServiceCustomer = {
  id: "customer_pet_followup_01",
  tenantId: "tenant_dispatch_demo",
  verticalId: "pet-care",
  displayName: "陈先生",
  phone: "91234567",
  preferredChannel: "whatsapp",
  language: "zh-HK",
  tags: [],
  notesAdmin: "",
  subjects: [
    {
      id: "pet_01",
      kind: "pet",
      displayName: "豆豆",
      fields: { species: "狗" },
    },
  ],
  followUp: {
    lastService: "全套美容",
    lastServiceDate: "2026-08-01",
    ruleId: "pet_groom_6w",
    ruleLabel: "6 周美容提醒",
    dueAt: "2026-09-12T00:00:00.000Z",
    customerMessage: "距离上次美容约 6 周，如需要可以在这里安排下一次护理。",
  },
  source: "legacy_import",
  sourceRef: "demo:pet",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function openMarketingWindow(target: ServiceCustomer = customer) {
  messagingAutomationControlRepository.optInWhatsApp({
    tenantId: target.tenantId,
    verticalId: target.verticalId,
    customerId: target.id,
    scopes: ["utility", "marketing"],
  });
  messagingAutomationControlRepository.recordCustomerMessage({
    tenantId: target.tenantId,
    verticalId: target.verticalId,
    customerId: target.id,
    at: new Date().toISOString(),
  });
}

beforeEach(() => installBrowserStorage());
afterEach(() => vi.unstubAllGlobals());

describe("ServiceWorkItemDispatchRuntime", () => {
  it("批准后的 Follow-up 草稿在 opt-in + 24h 窗口内，只有真实 send 成功后才标 done", async () => {
    openMarketingWindow();
    const vertical = getVerticalPack("pet-care")!;
    const item = createFollowUpWorkItem({ customer, vertical });
    serviceWorkItemRepository.setStatus(customer.tenantId, item.id, "ready_to_send", "staff_01");

    const workItems = new BrowserServiceWorkItemRepository();
    const conversations = new BrowserServiceConversationRepository();
    const runtime = new ServiceWorkItemDispatchRuntime(workItems, conversations);
    const adapter = new MockWhatsAppAdapter();

    const result = await runtime.dispatch({
      tenantId: customer.tenantId,
      verticalId: customer.verticalId,
      workItemId: item.id,
      customer,
      adapter,
    });

    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.workItem?.status).toBe("done");
    expect(result.workItem?.dispatchReceipt?.providerMessageId).toBeTruthy();
    expect(adapter.snapshot()).toHaveLength(1);
    expect(adapter.snapshot()[0]?.recipientPhone).toBe(customer.phone);

    const conversation = conversations.list(customer.tenantId, customer.verticalId)[0];
    expect(conversation?.customerId).toBe(customer.id);
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]?.from).toBe("agent");
    expect(conversation?.messages[0]?.text).toContain("6 周");
  });

  it("没有 WhatsApp opt-in 时 fail-closed，连 Adapter send 都不会调用", async () => {
    const vertical = getVerticalPack("pet-care")!;
    const item = createFollowUpWorkItem({ customer, vertical });
    serviceWorkItemRepository.setStatus(customer.tenantId, item.id, "ready_to_send", "staff_01");
    const adapter = new MockWhatsAppAdapter();
    const runtime = new ServiceWorkItemDispatchRuntime(
      new BrowserServiceWorkItemRepository(),
      new BrowserServiceConversationRepository(),
    );

    const result = await runtime.dispatch({
      tenantId: customer.tenantId,
      verticalId: customer.verticalId,
      workItemId: item.id,
      customer,
      adapter,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("WHATSAPP_OPT_IN_REQUIRED");
    expect(adapter.snapshot()).toHaveLength(0);
  });

  it("相同 done work item 重放时只复用 dispatch receipt，不再次调用 Adapter", async () => {
    openMarketingWindow();
    const vertical = getVerticalPack("pet-care")!;
    const item = createFollowUpWorkItem({ customer, vertical });
    serviceWorkItemRepository.setStatus(customer.tenantId, item.id, "ready_to_send", "staff_01");

    const workItems = new BrowserServiceWorkItemRepository();
    const conversations = new BrowserServiceConversationRepository();
    const runtime = new ServiceWorkItemDispatchRuntime(workItems, conversations);
    const adapter = new MockWhatsAppAdapter();

    const first = await runtime.dispatch({
      tenantId: customer.tenantId,
      verticalId: customer.verticalId,
      workItemId: item.id,
      customer,
      adapter,
    });
    const second = await runtime.dispatch({
      tenantId: customer.tenantId,
      verticalId: customer.verticalId,
      workItemId: item.id,
      customer,
      adapter,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(adapter.snapshot()).toHaveLength(1);
    expect(conversations.list(customer.tenantId, customer.verticalId)[0]?.messages).toHaveLength(1);
  });

  it("政策已通过但 Adapter 发送失败时保持 ready_to_send，不写 Conversation", async () => {
    openMarketingWindow();
    const vertical = getVerticalPack("pet-care")!;
    const item = createFollowUpWorkItem({ customer, vertical });
    serviceWorkItemRepository.setStatus(customer.tenantId, item.id, "ready_to_send", "staff_01");

    let calls = 0;
    const failingAdapter: MessagingAdapter = {
      providerId: "test.whatsapp.fail",
      displayName: "Failing WhatsApp",
      channel: "whatsapp",
      providerKind: "demo",
      productionEligible: false,
      async send() {
        calls += 1;
        return {
          ok: false,
          providerMessageId: null,
          providerId: "test.whatsapp.fail",
          errorCode: "PROVIDER_DOWN",
          sentAt: "2026-09-07T15:00:00+08:00",
        };
      },
    };

    const workItems = new BrowserServiceWorkItemRepository();
    const conversations = new BrowserServiceConversationRepository();
    const runtime = new ServiceWorkItemDispatchRuntime(workItems, conversations);
    const result = await runtime.dispatch({
      tenantId: customer.tenantId,
      verticalId: customer.verticalId,
      workItemId: item.id,
      customer,
      adapter: failingAdapter,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PROVIDER_DOWN");
    expect(calls).toBe(1);
    expect(workItems.get(customer.tenantId, item.id)?.status).toBe("ready_to_send");
    expect(workItems.get(customer.tenantId, item.id)?.dispatchReceipt).toBeUndefined();
    expect(conversations.list(customer.tenantId, customer.verticalId)).toEqual([]);
  });

  it("production 模式拒绝 Mock WhatsApp，即使 opt-in 与 24h 窗口都满足", async () => {
    openMarketingWindow();
    const vertical = getVerticalPack("pet-care")!;
    const item = createFollowUpWorkItem({ customer, vertical });
    serviceWorkItemRepository.setStatus(customer.tenantId, item.id, "ready_to_send", "staff_01");
    const adapter = new MockWhatsAppAdapter();
    const runtime = new ServiceWorkItemDispatchRuntime(
      new BrowserServiceWorkItemRepository(),
      new BrowserServiceConversationRepository(),
    );

    const result = await runtime.dispatch({
      tenantId: customer.tenantId,
      verticalId: customer.verticalId,
      workItemId: item.id,
      customer,
      adapter,
      production: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("WHATSAPP_BUSINESS_PLATFORM_REQUIRED");
    expect(adapter.snapshot()).toHaveLength(0);
  });

  it("渠道不匹配时 fail-closed，连 send 都不会调用", async () => {
    const vertical = getVerticalPack("pet-care")!;
    const webCustomer: ServiceCustomer = { ...customer, id: "customer_web", preferredChannel: "web" };
    const item = createFollowUpWorkItem({ customer: webCustomer, vertical });
    serviceWorkItemRepository.setStatus(webCustomer.tenantId, item.id, "ready_to_send", "staff_01");

    const adapter = new MockWhatsAppAdapter();
    const runtime = new ServiceWorkItemDispatchRuntime(
      new BrowserServiceWorkItemRepository(),
      new BrowserServiceConversationRepository(),
    );
    const result = await runtime.dispatch({
      tenantId: webCustomer.tenantId,
      verticalId: webCustomer.verticalId,
      workItemId: item.id,
      customer: webCustomer,
      adapter,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CHANNEL_ADAPTER_MISMATCH");
    expect(adapter.snapshot()).toHaveLength(0);
  });
});
