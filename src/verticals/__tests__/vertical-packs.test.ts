import { describe, expect, it } from "vitest";

import type { ServiceTenant } from "@/core/tenant";
import { planServiceFrontdeskMessage } from "@/frontdesk/frontdesk-agent";
import { processServiceFrontdeskInboundMessage } from "@/frontdesk/inbound-service";
import { MockWhatsAppAdapter } from "@/integrations/messaging-adapter";
import {
  getVerticalPack,
  materializeFaqEntries,
  validateVerticalPack,
  verticalPacks,
} from "@/verticals/registry";

const tenantId = "tenant_demo";
const customerId = "customer_demo";

const tenant: ServiceTenant = {
  id: tenantId,
  verticalId: "pet-care",
  displayName: "毛孩屋 Demo",
  district: "香港",
  phone: "+852 3000 0000",
  timezone: "Asia/Hong_Kong",
  reminderLeadHours: [24],
  channels: [{ channel: "whatsapp", connected: true, note: "demo" }],
  privacy: { retentionDays: 180, maskCustomerPhoneInLists: true },
};

describe("Service Vertical Pack 契约", () => {
  it("所有已注册行业包都通过结构级契约校验", () => {
    for (const pack of verticalPacks) {
      const result = validateVerticalPack(pack);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("FAQ 模板只在物化时绑定租户，不把租户写死在行业包", () => {
    const dental = getVerticalPack("dental")!;
    const faq = materializeFaqEntries(dental, tenantId);

    expect(faq.length).toBeGreaterThan(0);
    expect(faq.every((entry) => entry.clinicId === tenantId)).toBe(true);
    expect(dental.faqTemplates.every((entry) => !("clinicId" in entry))).toBe(true);
  });

  it("宠物、美容、汽车、家居都可从注册表直接加载，不需要复制 Core", () => {
    for (const id of ["pet-care", "beauty", "auto-repair", "home-service"] as const) {
      const pack = getVerticalPack(id);
      expect(pack?.id).toBe(id);
      expect(pack?.metadata.candidate).toBe(true);
    }
  });
});

describe("同一前台 Core 的跨行业行为", () => {
  it("牙科：高优先级信号覆盖改期意图", () => {
    const dental = getVerticalPack("dental")!;
    const decision = planServiceFrontdeskMessage({
      tenantId,
      customerId,
      channel: "whatsapp",
      text: "我本身想改期，但而家面肿仲有发烧",
      vertical: dental,
    });

    expect(decision.kind).toBe("urgent_handoff");
    expect(decision.autoSendAllowed).toBe(false);
    expect(decision.matchedUrgentKeywords).toEqual(expect.arrayContaining(["面肿", "发烧"]));
  });

  it("宠物：普通美容预约直接进入同一个 booking 流程", () => {
    const pet = getVerticalPack("pet-care")!;
    const decision = planServiceFrontdeskMessage({
      tenantId,
      customerId,
      channel: "whatsapp",
      text: "我想预约下星期帮只狗冲凉，有冇位？",
      vertical: pet,
    });

    expect(decision.kind).toBe("appointment_request");
    expect(decision.appointmentIntent).toBe("book");
    expect(decision.requiresHuman).toBe(false);
  });

  it("宠物：疾病／用药问题由行业包限制并转人工", () => {
    const pet = getVerticalPack("pet-care")!;
    const decision = planServiceFrontdeskMessage({
      tenantId,
      customerId,
      channel: "whatsapp",
      text: "佢係咪有病？要唔要食药？",
      vertical: pet,
    });

    expect(decision.kind).toBe("human_handoff");
    expect(decision.autoSendAllowed).toBe(false);
    expect(decision.reasons).toContain("VERTICAL_RESTRICTED_QUESTION_REQUIRES_HUMAN");
  });

  it("家居：漏电／冒烟走高优先级人工升级，而不是给维修步骤", () => {
    const home = getVerticalPack("home-service")!;
    const decision = planServiceFrontdeskMessage({
      tenantId,
      customerId,
      channel: "whatsapp",
      text: "个插苏好似漏电，仲有冒烟",
      vertical: home,
    });

    expect(decision.kind).toBe("urgent_handoff");
    expect(decision.requiresHuman).toBe(true);
    expect(decision.autoSendAllowed).toBe(false);
  });

  it("家居：商户授权报价 FAQ 可以自动回答", () => {
    const home = getVerticalPack("home-service")!;
    const decision = planServiceFrontdeskMessage({
      tenantId,
      customerId,
      channel: "whatsapp",
      text: "点样报价？",
      vertical: home,
    });

    expect(decision.kind).toBe("faq_reply");
    expect(decision.autoSendAllowed).toBe(true);
    expect(decision.suggestedReply).toContain("报价");
  });

  it("汽车：危险车辆继续驾驶判断不会由前台 Agent 自主回答", () => {
    const auto = getVerticalPack("auto-repair")!;
    const decision = planServiceFrontdeskMessage({
      tenantId,
      customerId,
      channel: "whatsapp",
      text: "架车着咗警告灯，可唔可以继续开？",
      vertical: auto,
    });

    expect(decision.kind).toBe("human_handoff");
    expect(decision.autoSendAllowed).toBe(false);
  });
});

describe("通用入站链", () => {
  it("宠物行业 FAQ 复用同一 WhatsApp Adapter 自动发送", async () => {
    const adapter = new MockWhatsAppAdapter();
    const pet = getVerticalPack("pet-care")!;
    const result = await processServiceFrontdeskInboundMessage({
      tenant,
      vertical: pet,
      messagingAdapter: adapter,
      message: {
        providerMessageId: "pet_wa_001",
        tenantId,
        customerId,
        channel: "whatsapp",
        text: "点样预约美容？",
        receivedAt: new Date().toISOString(),
      },
    });

    expect(result.decision.kind).toBe("appointment_request");
    expect(result.autoReplyAttempted).toBe(true);
    expect(result.autoReplyReceipt?.ok).toBe(true);
    expect(adapter.snapshot()).toHaveLength(1);
  });

  it("消息 tenantId 不匹配时不调用通道且直接转人工", async () => {
    const adapter = new MockWhatsAppAdapter();
    const pet = getVerticalPack("pet-care")!;
    const result = await processServiceFrontdeskInboundMessage({
      tenant,
      vertical: pet,
      messagingAdapter: adapter,
      message: {
        providerMessageId: "pet_wa_cross_tenant",
        tenantId: "other_tenant",
        customerId,
        channel: "whatsapp",
        text: "几点开门？",
        receivedAt: new Date().toISOString(),
      },
    });

    expect(result.decision.kind).toBe("human_handoff");
    expect(result.decision.reasons).toContain("TENANT_MISMATCH");
    expect(result.autoReplyAttempted).toBe(false);
    expect(adapter.snapshot()).toHaveLength(0);
  });
});
