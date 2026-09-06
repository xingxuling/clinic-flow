import { describe, expect, it } from "vitest";

import { getAgentPlan } from "@/data/agent-plans";
import { InMemoryClinicRepository } from "@/data/repository";
import { executeAgentPlan, type AgentPlan } from "@/lib/agent-executor";

describe("Agent 受控执行内核", () => {
  it("批准改期任务后会真的修改预约并发送确认讯息", () => {
    const repo = new InMemoryClinicRepository();
    const task = repo.listAgentTasks("clinic_cinghe").find((row) => row.id === "at_01")!;
    const plan = getAgentPlan(task.id)!;
    const beforeMessageCount = repo
      .listConversations("clinic_cinghe")
      .find((row) => row.id === "cv_01")!.messages.length;

    const receipt = executeAgentPlan({
      repo,
      clinicId: "clinic_cinghe",
      task,
      plan,
      humanApproved: true,
      approvedBy: "staff_reception",
      approvedByName: "李樂怡",
      now: "2026-09-07T10:00:00.000Z",
      idFactory: (prefix) => `${prefix}_test`,
    });

    expect(receipt.ok).toBe(true);
    expect(receipt.operationCount).toBe(2);
    const appointment = repo
      .listAppointments("clinic_cinghe")
      .find((row) => row.id === "ap_01")!;
    expect(new Date(appointment.startAt).getHours()).toBe(15);
    expect(appointment.status).toBe("pending");
    expect(
      repo.listConversations("clinic_cinghe").find((row) => row.id === "cv_01")!.messages.length,
    ).toBe(beforeMessageCount + 1);
  });

  it("中风险任务没有人工批准时完全不执行", () => {
    const repo = new InMemoryClinicRepository();
    const task = repo.listAgentTasks("clinic_cinghe").find((row) => row.id === "at_01")!;
    const plan = getAgentPlan(task.id)!;
    const before = repo.listAppointments("clinic_cinghe").find((row) => row.id === "ap_01")!;

    const receipt = executeAgentPlan({
      repo,
      clinicId: "clinic_cinghe",
      task,
      plan,
      humanApproved: false,
      now: "2026-09-07T10:00:00.000Z",
    });

    expect(receipt.ok).toBe(false);
    expect(receipt.blocked).toBe(true);
    expect(receipt.errors).toContain("HUMAN_APPROVAL_REQUIRED");
    const after = repo.listAppointments("clinic_cinghe").find((row) => row.id === "ap_01")!;
    expect(after.startAt).toBe(before.startAt);
  });

  it("计划包含冲突时段时整单不执行，不会先做一半", () => {
    const repo = new InMemoryClinicRepository();
    const task = repo.listAgentTasks("clinic_cinghe").find((row) => row.id === "at_01")!;
    const conflictStart = repo
      .listAppointments("clinic_cinghe")
      .find((row) => row.id === "ap_03")!.startAt;
    const beforeMessageCount = repo
      .listConversations("clinic_cinghe")
      .find((row) => row.id === "cv_01")!.messages.length;
    const beforeStart = repo.listAppointments("clinic_cinghe").find((row) => row.id === "ap_01")!.startAt;

    const plan: AgentPlan = {
      taskId: task.id,
      operations: [
        { kind: "appointment.reschedule", appointmentId: "ap_01", startAt: conflictStart },
        { kind: "conversation.send", conversationId: "cv_01", text: "不应发送" },
      ],
    };

    const receipt = executeAgentPlan({
      repo,
      clinicId: "clinic_cinghe",
      task,
      plan,
      humanApproved: true,
      approvedBy: "staff_reception",
      now: "2026-09-07T10:00:00.000Z",
    });

    expect(receipt.ok).toBe(false);
    expect(receipt.errors.some((value) => value.includes("冲突"))).toBe(true);
    expect(repo.listAppointments("clinic_cinghe").find((row) => row.id === "ap_01")!.startAt).toBe(
      beforeStart,
    );
    expect(
      repo.listConversations("clinic_cinghe").find((row) => row.id === "cv_01")!.messages.length,
    ).toBe(beforeMessageCount);
  });

  it("跨诊所任务会被硬阻断", () => {
    const repo = new InMemoryClinicRepository();
    const task = repo.listAgentTasks("clinic_cinghe").find((row) => row.id === "at_06")!;
    const plan = getAgentPlan(task.id)!;

    const receipt = executeAgentPlan({
      repo,
      clinicId: "clinic_haiyue",
      task,
      plan,
      humanApproved: true,
      approvedBy: "staff_reception",
      now: "2026-09-07T10:00:00.000Z",
    });

    expect(receipt.ok).toBe(false);
    expect(receipt.errors).toContain("TASK_TENANT_MISMATCH");
    expect(repo.listAppointments("clinic_cinghe").find((row) => row.id === "ap_09")!.status).toBe(
      "pending",
    );
  });

  it("取消任务批准后会真正释放预约", () => {
    const repo = new InMemoryClinicRepository();
    const task = repo.listAgentTasks("clinic_cinghe").find((row) => row.id === "at_06")!;
    const plan = getAgentPlan(task.id)!;

    const receipt = executeAgentPlan({
      repo,
      clinicId: "clinic_cinghe",
      task,
      plan,
      humanApproved: true,
      approvedBy: "staff_reception",
      now: "2026-09-07T10:00:00.000Z",
    });

    expect(receipt.ok).toBe(true);
    expect(repo.listAppointments("clinic_cinghe").find((row) => row.id === "ap_09")!.status).toBe(
      "cancelled",
    );
  });
});
