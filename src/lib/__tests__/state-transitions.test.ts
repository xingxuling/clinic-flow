import { describe, expect, it } from "vitest";

import { canTransitionAppointment, InMemoryClinicRepository } from "@/data/repository";
import { canTransitionAgentTask, detectUrgent, initialStatusFor, mayAutoExecute } from "@/lib/agent-rules";
import { hasPermission } from "@/lib/permissions";

describe("預約狀態機", () => {
  it("待確認可以變成已確認或取消", () => {
    expect(canTransitionAppointment("pending", "confirmed")).toBe(true);
    expect(canTransitionAppointment("pending", "cancelled")).toBe(true);
  });

  it("待確認不能直接跳到已到診", () => {
    expect(canTransitionAppointment("pending", "arrived")).toBe(false);
  });

  it("已到診是終態", () => {
    expect(canTransitionAppointment("arrived", "cancelled")).toBe(false);
    expect(canTransitionAppointment("arrived", "pending")).toBe(false);
  });

  it("失約與取消可以重新安排", () => {
    expect(canTransitionAppointment("no_show", "pending")).toBe(true);
    expect(canTransitionAppointment("cancelled", "pending")).toBe(true);
  });
});

describe("Agent 任務狀態機", () => {
  it("等待批准可以完成或被否決", () => {
    expect(canTransitionAgentTask("waiting_approval", "done")).toBe(true);
    expect(canTransitionAgentTask("waiting_approval", "rejected")).toBe(true);
  });

  it("已完成與已否決為終態", () => {
    expect(canTransitionAgentTask("done", "waiting_approval")).toBe(false);
    expect(canTransitionAgentTask("rejected", "done")).toBe(false);
  });

  it("失敗只能轉回等待批准", () => {
    expect(canTransitionAgentTask("failed", "waiting_approval")).toBe(true);
    expect(canTransitionAgentTask("failed", "done")).toBe(false);
  });

  it("高風險任務不可自動執行，初始狀態為等待人工批准", () => {
    expect(mayAutoExecute({ risk: "high" })).toBe(false);
    expect(mayAutoExecute({ risk: "low" })).toBe(true);
    expect(initialStatusFor("high")).toBe("waiting_approval");
    expect(initialStatusFor("low")).toBe("auto_running");
  });
});

describe("緊急關鍵詞標記", () => {
  const keywords = ["面腫", "發燒", "流血不止"];

  it("沒有命中時不產生標記", () => {
    expect(detectUrgent("想問下星期六有冇位洗牙", keywords).rule).toBeNull();
  });

  it("命中多個關鍵詞時說明觸發原因", () => {
    const r = detectUrgent("今朝面腫仲發燒", keywords);
    expect(r.matched).toEqual(["面腫", "發燒"]);
    expect(r.rule).toContain("2");
  });
});

describe("角色權限", () => {
  it("只讀角色不能修改預約", () => {
    expect(hasPermission("readonly", "appointment.write")).toBe(false);
    expect(hasPermission("readonly", "appointment.read")).toBe(true);
  });

  it("只有負責人可以管理員工", () => {
    expect(hasPermission("owner", "staff.manage")).toBe(true);
    expect(hasPermission("reception", "staff.manage")).toBe(false);
  });
});

describe("多租戶隔離", () => {
  it("查詢只回傳該診所的資料", () => {
    const repo = new InMemoryClinicRepository();
    const a = repo.listPatients("clinic_cinghe");
    const b = repo.listPatients("clinic_haiyue");
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBe(0);
    expect(a.every((p) => p.clinicId === "clinic_cinghe")).toBe(true);
  });

  it("不能跨診所修改資料", () => {
    const repo = new InMemoryClinicRepository();
    const id = repo.listAppointments("clinic_cinghe")[0]!.id;
    repo.updateAppointment("clinic_haiyue", id, { status: "cancelled" });
    expect(repo.listAppointments("clinic_cinghe").find((x) => x.id === id)!.status).not.toBe(
      "cancelled",
    );
  });
});
