import { describe, expect, it } from "vitest";

import { demoDentalFaq } from "@/frontdesk/faq-seed";
import { matchClinicFaq } from "@/frontdesk/faq-engine";
import { planFrontdeskMessage } from "@/frontdesk/frontdesk-agent";
import { processFrontdeskInboundMessage } from "@/frontdesk/inbound-service";
import { seedClinics } from "@/data/seed";
import { MockWhatsAppAdapter } from "@/integrations/messaging-adapter";

const clinic = seedClinics.find((row) => row.id === "clinic_cinghe")!;

describe("第一阶段 FAQ", () => {
  it("只从诊所授权 FAQ 回答营业时间", () => {
    const result = matchClinicFaq({
      clinicId: clinic.id,
      channel: "whatsapp",
      text: "你哋星期六幾點開門？",
      entries: demoDentalFaq,
    });

    expect(result.kind).toBe("answer");
    expect(result.entryId).toBe("faq_hours");
    expect(result.answer).toContain("上午 9:30");
  });

  it("医疗判断问题即使有相似字词也转人工", () => {
    const result = matchClinicFaq({
      clinicId: clinic.id,
      channel: "whatsapp",
      text: "我隻牙咁痛係咪有病？應該點醫？",
      entries: demoDentalFaq,
    });

    expect(result.kind).toBe("handoff");
    expect(result.reason).toBe("MEDICAL_ADVICE_REQUEST_REQUIRES_HUMAN");
  });
});

describe("第一阶段前台编排", () => {
  it("紧急关键词优先于改期意图", () => {
    const decision = planFrontdeskMessage({
      clinicId: clinic.id,
      patientId: "pt_01",
      channel: "whatsapp",
      text: "我本身想改期，但而家面腫仲有少少發燒",
      urgentKeywords: clinic.settings.urgentKeywords,
      faqEntries: demoDentalFaq,
    });

    expect(decision.kind).toBe("urgent_handoff");
    expect(decision.requiresHuman).toBe(true);
    expect(decision.autoSendAllowed).toBe(false);
    expect(decision.matchedUrgentKeywords).toContain("面腫");
  });

  it("普通改期请求进入预约适配器流程", () => {
    const decision = planFrontdeskMessage({
      clinicId: clinic.id,
      patientId: "pt_01",
      channel: "whatsapp",
      text: "我想將星期二個預約改期去星期四",
      urgentKeywords: clinic.settings.urgentKeywords,
      faqEntries: demoDentalFaq,
    });

    expect(decision.kind).toBe("appointment_request");
    expect(decision.appointmentIntent).toBe("reschedule");
    expect(decision.requiresHuman).toBe(false);
  });

  it("未知问题 fail-closed 转人工", () => {
    const decision = planFrontdeskMessage({
      clinicId: clinic.id,
      patientId: "pt_01",
      channel: "whatsapp",
      text: "我有一個比較複雜嘅私人安排想問你哋",
      urgentKeywords: clinic.settings.urgentKeywords,
      faqEntries: demoDentalFaq,
    });

    expect(decision.kind).toBe("human_handoff");
    expect(decision.autoSendAllowed).toBe(false);
    expect(decision.requiresHuman).toBe(true);
  });
});

describe("WhatsApp 自动回复闭环", () => {
  it("授权 FAQ 会经 WhatsApp 模拟适配器发送", async () => {
    const adapter = new MockWhatsAppAdapter();
    const result = await processFrontdeskInboundMessage({
      clinic,
      faqEntries: demoDentalFaq,
      messagingAdapter: adapter,
      message: {
        providerMessageId: "wa_in_001",
        clinicId: clinic.id,
        patientId: "pt_01",
        channel: "whatsapp",
        text: "診所喺邊？",
        receivedAt: new Date().toISOString(),
      },
    });

    expect(result.decision.kind).toBe("faq_reply");
    expect(result.autoReplyAttempted).toBe(true);
    expect(result.autoReplyReceipt?.ok).toBe(true);
    expect(adapter.snapshot()).toHaveLength(1);
  });

  it("紧急讯息不会由自动回复流程自行处理", async () => {
    const adapter = new MockWhatsAppAdapter();
    const result = await processFrontdeskInboundMessage({
      clinic,
      faqEntries: demoDentalFaq,
      messagingAdapter: adapter,
      message: {
        providerMessageId: "wa_in_002",
        clinicId: clinic.id,
        patientId: "pt_01",
        channel: "whatsapp",
        text: "而家仲流血不止",
        receivedAt: new Date().toISOString(),
      },
    });

    expect(result.decision.kind).toBe("urgent_handoff");
    expect(result.autoReplyAttempted).toBe(false);
    expect(result.humanTaskRequired).toBe(true);
    expect(adapter.snapshot()).toHaveLength(0);
  });
});
