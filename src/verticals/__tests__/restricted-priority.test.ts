import { describe, expect, it } from "vitest";

import { planServiceFrontdeskMessage } from "@/frontdesk/frontdesk-agent";
import { getVerticalPack } from "@/verticals/registry";

describe("受限问题优先级", () => {
  it("宠物讯息同时包含预约和疾病用药问题时必须先转人工", () => {
    const pet = getVerticalPack("pet-care")!;
    const decision = planServiceFrontdeskMessage({
      tenantId: "pet_demo",
      customerId: "owner_demo",
      channel: "whatsapp",
      text: "我想预约冲凉，不过佢係咪有病？要唔要食药？",
      vertical: pet,
    });

    expect(decision.kind).toBe("human_handoff");
    expect(decision.appointmentIntent).toBeNull();
    expect(decision.autoSendAllowed).toBe(false);
    expect(decision.reasons).toContain("VERTICAL_RESTRICTED_QUESTION_REQUIRES_HUMAN");
  });

  it("牙科讯息同时包含预约和医疗判断时同样先转人工", () => {
    const dental = getVerticalPack("dental")!;
    const decision = planServiceFrontdeskMessage({
      tenantId: "dental_demo",
      customerId: "patient_demo",
      channel: "whatsapp",
      text: "我想预约，但隻牙係咪有病？应该点治疗？",
      vertical: dental,
    });

    expect(decision.kind).toBe("human_handoff");
    expect(decision.autoSendAllowed).toBe(false);
  });
});
