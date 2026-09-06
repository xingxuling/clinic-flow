import type { AgentPlan } from "@/lib/agent-executor";

function todayAt(hhmm: string): string {
  const d = new Date();
  const [hour, minute] = hhmm.split(":").map(Number);
  d.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return d.toISOString();
}

/**
 * Demo 的机器可执行计划。
 *
 * 真实环境中这些计划应由受约束的 Agent Planner 生成，写入数据库，并与任务一起保留
 * 版本、来源、批准人和执行回执。这里先把「审批后真的执行」闭环做起来。
 */
const DEMO_AGENT_PLANS: Record<string, AgentPlan> = {
  at_01: {
    taskId: "at_01",
    operations: [
      {
        kind: "appointment.reschedule",
        appointmentId: "ap_01",
        startAt: todayAt("15:00"),
      },
      {
        kind: "conversation.send",
        conversationId: "cv_01",
        text: "周小姐你好，你的预约已按要求改至今日 15:00。请回复确认，如有变动可再通知我们。",
      },
    ],
  },
  at_03: {
    taskId: "at_03",
    operations: [
      {
        kind: "urgent.escalate",
        urgentFlagId: "uf_01",
      },
      {
        kind: "appointment.create",
        patientId: "pt_08",
        practitionerId: "staff_dr_lam",
        serviceId: "svc_check",
        startAt: todayAt("17:00"),
        durationMin: 30,
        room: "1 號診室",
        adminNote: "潜在紧急标记后由职员批准加插；仅属行政安排，不代表医学分诊结论。",
      },
      {
        kind: "conversation.send",
        conversationId: "cv_02",
        text: "鄧先生，你的情况已转交诊所人员，并暂为你安排今日 17:00 的加插时段。请留意诊所来电确认。",
      },
    ],
  },
  at_06: {
    taskId: "at_06",
    operations: [
      {
        kind: "appointment.cancel",
        appointmentId: "ap_09",
      },
    ],
  },
};

export function getAgentPlan(taskId: string): AgentPlan | null {
  return DEMO_AGENT_PLANS[taskId] ?? null;
}
