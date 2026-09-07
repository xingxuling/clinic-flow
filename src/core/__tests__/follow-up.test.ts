import { describe, expect, it } from "vitest";

import { planServiceFollowUps } from "@/core/follow-up";
import { getVerticalPack } from "@/verticals/registry";

const now = new Date("2026-09-07T00:00:00.000Z");

describe("通用 Follow-up / Recall", () => {
  it("牙科同一引擎生成 6 / 12 个月洗牙召回", () => {
    const dental = getVerticalPack("dental")!;
    const candidates = planServiceFollowUps({
      vertical: dental,
      now,
      records: [
        {
          tenantId: "dental_1",
          customerId: "patient_1",
          serviceId: "svc_scaling",
          completedAt: "2025-09-01T00:00:00.000Z",
        },
      ],
    });

    expect(candidates.map((row) => row.ruleId)).toEqual(
      expect.arrayContaining(["dental_scaling_6m", "dental_scaling_12m"]),
    );
  });

  it("宠物美容与汽车保养无需新引擎即可生成各自召回", () => {
    const pet = getVerticalPack("pet-care")!;
    const auto = getVerticalPack("auto-repair")!;

    const petCandidates = planServiceFollowUps({
      vertical: pet,
      now,
      records: [
        {
          tenantId: "pet_1",
          customerId: "owner_1",
          subjectId: "pet_dog_1",
          serviceId: "pet_full_groom",
          completedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    const autoCandidates = planServiceFollowUps({
      vertical: auto,
      now,
      records: [
        {
          tenantId: "auto_1",
          customerId: "driver_1",
          subjectId: "vehicle_1",
          serviceId: "auto_basic_service",
          completedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });

    expect(petCandidates[0]?.ruleId).toBe("pet_groom_6w");
    expect(petCandidates[0]?.subjectId).toBe("pet_dog_1");
    expect(autoCandidates[0]?.ruleId).toBe("auto_service_180d");
  });

  it("同一规则只取最近一次相关服务，避免旧记录重复召回", () => {
    const home = getVerticalPack("home-service")!;
    const candidates = planServiceFollowUps({
      vertical: home,
      now,
      records: [
        {
          tenantId: "home_1",
          customerId: "customer_1",
          subjectId: "flat_1",
          serviceId: "home_cleaning",
          completedAt: "2026-06-01T00:00:00.000Z",
        },
        {
          tenantId: "home_1",
          customerId: "customer_1",
          subjectId: "flat_1",
          serviceId: "home_cleaning",
          completedAt: "2026-08-20T00:00:00.000Z",
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.sourceCompletedAt).toBe("2026-08-20T00:00:00.000Z");
  });
});
