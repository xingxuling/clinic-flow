import { canTransitionAppointment, type ClinicRepository } from "@/data/repository";
import { mayAutoExecute } from "@/lib/agent-rules";
import type { AgentTask, Appointment, ID } from "@/types/domain";

/**
 * Agent 只能执行这里显式列出的行政动作。
 * 没有「任意代码」「医学诊断」「治疗建议」之类的逃生口。
 */
export type AgentOperation =
  | {
      kind: "appointment.reschedule";
      appointmentId: ID;
      startAt: string;
    }
  | {
      kind: "appointment.cancel";
      appointmentId: ID;
    }
  | {
      kind: "appointment.create";
      patientId: ID;
      practitionerId: ID;
      serviceId: ID;
      startAt: string;
      durationMin: number;
      room: string;
      adminNote: string;
    }
  | {
      kind: "conversation.send";
      conversationId: ID;
      text: string;
    }
  | {
      kind: "urgent.escalate";
      urgentFlagId: ID;
    }
  | {
      kind: "reminder.mark_sent";
      reminderId: ID;
    };

export interface AgentPlan {
  taskId: ID;
  operations: AgentOperation[];
}

export interface AgentOperationReceipt {
  index: number;
  kind: AgentOperation["kind"];
  ok: boolean;
  detail: string;
}

export interface AgentExecutionReceipt {
  schemaId: "clinic-flow.agent-execution-receipt.v1";
  taskId: ID;
  clinicId: ID;
  ok: boolean;
  blocked: boolean;
  executedAt: string;
  operationCount: number;
  operations: AgentOperationReceipt[];
  errors: string[];
}

export interface ExecuteAgentPlanInput {
  repo: ClinicRepository;
  clinicId: ID;
  task: AgentTask;
  plan: AgentPlan;
  /** 中/高风险必须来自有 agent.approve 权限的人类批准。 */
  humanApproved: boolean;
  approvedBy?: ID;
  approvedByName?: string;
  now?: string;
  idFactory?: (prefix: string) => ID;
}

interface ValidationContext {
  repo: ClinicRepository;
  clinicId: ID;
  task: AgentTask;
  now: string;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && ae > bs;
}

function appointmentEnd(startAt: string, durationMin: number): string {
  return new Date(new Date(startAt).getTime() + durationMin * 60_000).toISOString();
}

function appointmentDurationMin(appointment: Appointment): number {
  return Math.max(
    1,
    Math.round(
      (new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) / 60_000,
    ),
  );
}

function validateAppointmentSlot(
  ctx: ValidationContext,
  practitionerId: ID,
  startAt: string,
  endAt: string,
  excludeAppointmentId?: ID,
): string | null {
  const conflict = ctx.repo.listAppointments(ctx.clinicId).find((row) => {
    if (row.id === excludeAppointmentId || row.status === "cancelled") return false;
    if (row.practitionerId !== practitionerId) return false;
    return overlaps(startAt, endAt, row.startAt, row.endAt);
  });
  return conflict ? `时段与预约 ${conflict.id} 冲突` : null;
}

function validateOperation(
  operation: AgentOperation,
  ctx: ValidationContext,
): string | null {
  const taskPatientId = ctx.task.relatedPatientId;

  switch (operation.kind) {
    case "appointment.reschedule": {
      const appointment = ctx.repo
        .listAppointments(ctx.clinicId)
        .find((row) => row.id === operation.appointmentId);
      if (!appointment) return `找不到预约 ${operation.appointmentId}`;
      if (taskPatientId && appointment.patientId !== taskPatientId) {
        return `预约 ${operation.appointmentId} 不属于任务关联病人`;
      }
      if (!canTransitionAppointment(appointment.status, "pending")) {
        return `预约 ${operation.appointmentId} 当前状态不可改期`;
      }
      const durationMin = appointmentDurationMin(appointment);
      const endAt = appointmentEnd(operation.startAt, durationMin);
      return validateAppointmentSlot(
        ctx,
        appointment.practitionerId,
        operation.startAt,
        endAt,
        appointment.id,
      );
    }

    case "appointment.cancel": {
      const appointment = ctx.repo
        .listAppointments(ctx.clinicId)
        .find((row) => row.id === operation.appointmentId);
      if (!appointment) return `找不到预约 ${operation.appointmentId}`;
      if (taskPatientId && appointment.patientId !== taskPatientId) {
        return `预约 ${operation.appointmentId} 不属于任务关联病人`;
      }
      return canTransitionAppointment(appointment.status, "cancelled")
        ? null
        : `预约 ${operation.appointmentId} 当前状态不可取消`;
    }

    case "appointment.create": {
      if (taskPatientId && operation.patientId !== taskPatientId) {
        return "新预约病人与任务关联病人不一致";
      }
      if (!ctx.repo.listPatients(ctx.clinicId).some((row) => row.id === operation.patientId)) {
        return `找不到病人 ${operation.patientId}`;
      }
      const practitioner = ctx.repo
        .listStaff(ctx.clinicId)
        .find((row) => row.id === operation.practitionerId && row.active);
      if (!practitioner || practitioner.role !== "practitioner") {
        return `找不到可用诊疗人员 ${operation.practitionerId}`;
      }
      const clinic = ctx.repo.getClinic(ctx.clinicId);
      if (!clinic?.services.some((service) => service.id === operation.serviceId)) {
        return `找不到服务 ${operation.serviceId}`;
      }
      if (!Number.isFinite(operation.durationMin) || operation.durationMin <= 0) {
        return "预约时长无效";
      }
      const endAt = appointmentEnd(operation.startAt, operation.durationMin);
      return validateAppointmentSlot(
        ctx,
        operation.practitionerId,
        operation.startAt,
        endAt,
      );
    }

    case "conversation.send": {
      const conversation = ctx.repo
        .listConversations(ctx.clinicId)
        .find((row) => row.id === operation.conversationId);
      if (!conversation) return `找不到对话 ${operation.conversationId}`;
      if (taskPatientId && conversation.patientId !== taskPatientId) {
        return `对话 ${operation.conversationId} 不属于任务关联病人`;
      }
      if (!operation.text.trim()) return "发送内容不能为空";
      return null;
    }

    case "urgent.escalate": {
      const flag = ctx.repo
        .listUrgentFlags(ctx.clinicId)
        .find((row) => row.id === operation.urgentFlagId);
      if (!flag) return `找不到紧急标记 ${operation.urgentFlagId}`;
      if (taskPatientId && flag.patientId !== taskPatientId) {
        return `紧急标记 ${operation.urgentFlagId} 不属于任务关联病人`;
      }
      return null;
    }

    case "reminder.mark_sent": {
      const reminder = ctx.repo
        .listReminders(ctx.clinicId)
        .find((row) => row.id === operation.reminderId);
      if (!reminder) return `找不到提醒 ${operation.reminderId}`;
      if (taskPatientId && reminder.patientId !== taskPatientId) {
        return `提醒 ${operation.reminderId} 不属于任务关联病人`;
      }
      return reminder.status === "cancelled" ? "已取消提醒不可发送" : null;
    }
  }
}

function operationDetail(operation: AgentOperation): string {
  switch (operation.kind) {
    case "appointment.reschedule":
      return `${operation.appointmentId} → ${operation.startAt}`;
    case "appointment.cancel":
      return operation.appointmentId;
    case "appointment.create":
      return `${operation.patientId} @ ${operation.startAt}`;
    case "conversation.send":
      return `${operation.conversationId}: ${operation.text.slice(0, 40)}`;
    case "urgent.escalate":
      return operation.urgentFlagId;
    case "reminder.mark_sent":
      return operation.reminderId;
  }
}

/**
 * 受控执行：先完整验证，再统一落地。
 * 只要任何一个 operation 无效，就一个都不执行，避免「半成功」行政状态。
 */
export function executeAgentPlan(input: ExecuteAgentPlanInput): AgentExecutionReceipt {
  const now = input.now ?? new Date().toISOString();
  const idFactory =
    input.idFactory ??
    ((prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

  const base: Omit<AgentExecutionReceipt, "ok" | "blocked" | "operations" | "errors"> = {
    schemaId: "clinic-flow.agent-execution-receipt.v1",
    taskId: input.task.id,
    clinicId: input.clinicId,
    executedAt: now,
    operationCount: input.plan.operations.length,
  };

  const hardErrors: string[] = [];
  if (input.task.clinicId !== input.clinicId) hardErrors.push("TASK_TENANT_MISMATCH");
  if (input.plan.taskId !== input.task.id) hardErrors.push("PLAN_TASK_MISMATCH");
  if (!mayAutoExecute(input.task) && !input.humanApproved) {
    hardErrors.push("HUMAN_APPROVAL_REQUIRED");
  }
  if (input.humanApproved && !input.approvedBy) hardErrors.push("APPROVER_REQUIRED");
  if (input.plan.operations.length === 0) hardErrors.push("EMPTY_PLAN");

  const ctx: ValidationContext = {
    repo: input.repo,
    clinicId: input.clinicId,
    task: input.task,
    now,
  };

  const validationErrors = input.plan.operations
    .map((operation, index) => {
      const error = validateOperation(operation, ctx);
      return error ? `op#${index + 1}:${error}` : null;
    })
    .filter((value): value is string => Boolean(value));

  const errors = [...hardErrors, ...validationErrors];
  if (errors.length > 0) {
    return {
      ...base,
      ok: false,
      blocked: true,
      operations: [],
      errors,
    };
  }

  const receipts: AgentOperationReceipt[] = [];

  for (const [index, operation] of input.plan.operations.entries()) {
    switch (operation.kind) {
      case "appointment.reschedule": {
        const appointment = input.repo
          .listAppointments(input.clinicId)
          .find((row) => row.id === operation.appointmentId)!;
        const durationMin = appointmentDurationMin(appointment);
        input.repo.updateAppointment(input.clinicId, appointment.id, {
          startAt: operation.startAt,
          endAt: appointmentEnd(operation.startAt, durationMin),
          status: "pending",
        });
        break;
      }

      case "appointment.cancel":
        input.repo.updateAppointment(input.clinicId, operation.appointmentId, {
          status: "cancelled",
        });
        break;

      case "appointment.create": {
        const appointment: Appointment = {
          id: idFactory("ap_agent"),
          clinicId: input.clinicId,
          patientId: operation.patientId,
          practitionerId: operation.practitionerId,
          serviceId: operation.serviceId,
          startAt: operation.startAt,
          endAt: appointmentEnd(operation.startAt, operation.durationMin),
          status: "pending",
          room: operation.room,
          note: operation.adminNote,
          createdBy: { type: "agent", id: "agent_admin", name: "行政 Agent" },
        };
        input.repo.addAppointment(appointment);
        break;
      }

      case "conversation.send": {
        const conversation = input.repo
          .listConversations(input.clinicId)
          .find((row) => row.id === operation.conversationId)!;
        input.repo.updateConversation(input.clinicId, conversation.id, {
          lastAt: now,
          unread: false,
          messages: [
            ...conversation.messages,
            {
              id: idFactory("m_agent"),
              conversationId: conversation.id,
              from: "agent",
              authorName: "行政 Agent",
              text: operation.text,
              at: now,
            },
          ],
        });
        break;
      }

      case "urgent.escalate":
        input.repo.updateUrgentFlag(input.clinicId, operation.urgentFlagId, {
          handledBy: input.approvedBy,
          handledAt: now,
        });
        break;

      case "reminder.mark_sent":
        input.repo.updateReminder(input.clinicId, operation.reminderId, {
          status: "sent",
        });
        break;
    }

    receipts.push({
      index,
      kind: operation.kind,
      ok: true,
      detail: operationDetail(operation),
    });
  }

  return {
    ...base,
    ok: true,
    blocked: false,
    operations: receipts,
    errors: [],
  };
}
