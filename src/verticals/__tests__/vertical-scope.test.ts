import { describe, expect, it } from "vitest";

import { InMemoryClinicRepository } from "@/data/repository";
import type { Appointment } from "@/types/domain";
import { belongsToVertical, entityVerticalId, filterByVertical } from "@/verticals/entity-scope";
import { resolveVerticalIdForService, verticalPacks } from "@/verticals/registry";

function booking(serviceId: string, id: string): Appointment {
  return {
    id,
    clinicId: "clinic_cinghe",
    patientId: "customer_demo",
    practitionerId: "staff_reception",
    serviceId,
    startAt: "2026-09-08T10:00:00+08:00",
    endAt: "2026-09-08T11:00:00+08:00",
    status: "pending",
    room: "demo",
    note: "scope test",
    createdBy: { type: "staff", id: "staff_reception", name: "Demo" },
  };
}

describe("legacy vertical compatibility", () => {
  it("旧实体没有 verticalId 时只属于 dental", () => {
    const legacy = { id: "legacy" };
    expect(entityVerticalId(legacy)).toBe("dental");
    expect(belongsToVertical(legacy, "dental")).toBe(true);
    expect(belongsToVertical(legacy, "pet-care")).toBe(false);
  });

  it("同一数组按 verticalId 隔离，不会把 dental seed 混入其他行业", () => {
    const rows = [
      { id: "old-dental" },
      { id: "pet", verticalId: "pet-care" },
      { id: "auto", verticalId: "auto-repair" },
    ];
    expect(filterByVertical(rows, "dental").map((row) => row.id)).toEqual(["old-dental"]);
    expect(filterByVertical(rows, "pet-care").map((row) => row.id)).toEqual(["pet"]);
    expect(filterByVertical(rows, "auto-repair").map((row) => row.id)).toEqual(["auto"]);
  });
});

describe("service id ownership", () => {
  it("已注册 service id 在所有 Vertical Pack 中全局唯一", () => {
    const owners = new Map<string, string>();
    for (const pack of verticalPacks) {
      for (const service of pack.services) {
        expect(owners.has(service.id), `duplicate service id: ${service.id}`).toBe(false);
        owners.set(service.id, pack.id);
        expect(resolveVerticalIdForService(service.id)).toBe(pack.id);
      }
    }
  });

  it("未知 service id 不会被猜成某个行业", () => {
    expect(resolveVerticalIdForService("unknown_service")).toBeNull();
  });
});

describe("booking repository vertical stamping", () => {
  it("新增宠物 Booking 时 Repository 自动写入 pet-care verticalId", () => {
    const repo = new InMemoryClinicRepository();
    repo.addAppointment(booking("pet_full_groom", "ap_pet_scope"));

    const created = repo.listAppointments("clinic_cinghe").find((row) => row.id === "ap_pet_scope");
    expect(created?.verticalId).toBe("pet-care");
    expect(filterByVertical(repo.listAppointments("clinic_cinghe"), "pet-care").some((row) => row.id === "ap_pet_scope")).toBe(true);
    expect(filterByVertical(repo.listAppointments("clinic_cinghe"), "dental").some((row) => row.id === "ap_pet_scope")).toBe(false);
  });

  it("无法解析 service ownership 时 addAppointment fail-closed", () => {
    const repo = new InMemoryClinicRepository();
    expect(() => repo.addAppointment(booking("unknown_service", "ap_unknown_scope"))).toThrow(
      "BOOKING_VERTICAL_UNRESOLVED:unknown_service",
    );
  });
});
