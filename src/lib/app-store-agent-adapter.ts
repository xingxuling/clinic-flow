import type { ClinicRepository } from "@/data/repository";
import type { NewAppointmentInput } from "@/state/app-store";
import type {
  AgentTask,
  Appointment,
  AuditEvent,
  Clinic,
  Conversation,
  DocumentCase,
  ID,
  Invite,
  Patient,
  Permission,
  Reminder,
  Staff,
  UrgentFlag,
} from "@/types/domain";

/**
 * 把现有 React Store 的受权限保护动作，适配成 Agent 执行内核需要的 Repository。
 *
 * 这是过渡层：真正接 PostgreSQL / Supabase 后，应把 executeAgentPlan 放到服务器事务里，
 * 由数据库事务保证原子性。当前 Demo 仍先完整预验证，再调用既有受控动作。
 */
export interface AgentStorePort {
  clinic: Clinic;
  currentStaff: Staff;
  staff: Staff[];
  patients: Patient[];
  appointments: Appointment[];
  conversations: Conversation[];
  urgentFlags: UrgentFlag[];
  agentTasks: AgentTask[];
  reminders: Reminder[];
  documents: DocumentCase[];
  invites: Invite[];
  auditEvents: AuditEvent[];
  can: (permission: Permission) => boolean;

  setAppointmentStatus: (id: ID, to: Appointment["status"]) => void;
  rescheduleAppointment: (id: ID, startAt: string) => void;
  createAppointment: (input: NewAppointmentInput) => void;
  sendReply: (conversationId: ID, text: string) => void;
  escalateUrgentFlag: (id: ID) => void;
  updateReminderStatus: (id: ID, status: "cancelled" | "sent") => void;
}

function scope<T extends { clinicId: ID }>(rows: T[], clinicId: ID): T[] {
  return rows.filter((row) => row.clinicId === clinicId);
}

function unsupported(name: string): never {
  throw new Error(`AGENT_STORE_ADAPTER_UNSUPPORTED:${name}`);
}

export function requiredPermissionsForAgentPlan(operations: { kind: string }[]): Permission[] {
  const required = new Set<Permission>(["agent.approve"]);

  for (const operation of operations) {
    if (
      operation.kind === "appointment.reschedule" ||
      operation.kind === "appointment.cancel" ||
      operation.kind === "appointment.create" ||
      operation.kind === "reminder.mark_sent"
    ) {
      required.add("appointment.write");
    }
    if (operation.kind === "conversation.send" || operation.kind === "urgent.escalate") {
      required.add("conversation.reply");
    }
  }

  return [...required];
}

export function createAgentStoreRepository(port: AgentStorePort): ClinicRepository {
  return {
    getClinic: (clinicId) => (port.clinic.id === clinicId ? port.clinic : undefined),
    listStaff: (clinicId) => scope(port.staff, clinicId),
    listPatients: (clinicId) => scope(port.patients, clinicId),
    listAppointments: (clinicId) => scope(port.appointments, clinicId),
    listConversations: (clinicId) => scope(port.conversations, clinicId),
    listUrgentFlags: (clinicId) => scope(port.urgentFlags, clinicId),
    listAgentTasks: (clinicId) => scope(port.agentTasks, clinicId),
    listReminders: (clinicId) => scope(port.reminders, clinicId),
    listDocuments: (clinicId) => scope(port.documents, clinicId),
    listInvites: (clinicId) => scope(port.invites, clinicId),
    listAuditEvents: (clinicId) => scope(port.auditEvents, clinicId),

    addPatient: () => unsupported("addPatient"),
    updatePatient: () => unsupported("updatePatient"),

    updateAppointment: (_clinicId, id, patch) => {
      if (typeof patch.startAt === "string") {
        port.rescheduleAppointment(id, patch.startAt);
        return;
      }
      if (patch.status === "cancelled") {
        port.setAppointmentStatus(id, "cancelled");
        return;
      }
      unsupported("updateAppointment.patch");
    },

    addAppointment: (appointment) => {
      const durationMin = Math.max(
        1,
        Math.round(
          (new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) /
            60_000,
        ),
      );
      port.createAppointment({
        patientId: appointment.patientId,
        practitionerId: appointment.practitionerId,
        serviceId: appointment.serviceId,
        startAt: appointment.startAt,
        durationMin,
        room: appointment.room,
        note: appointment.note,
      });
    },

    updateConversation: (clinicId, id, patch) => {
      const current = scope(port.conversations, clinicId).find((row) => row.id === id);
      const nextMessages = patch.messages;
      if (!current || !nextMessages || nextMessages.length <= current.messages.length) {
        unsupported("updateConversation.patch");
      }
      const message = nextMessages[nextMessages.length - 1];
      if (!message || !message.text.trim()) unsupported("updateConversation.message");
      port.sendReply(id, message.text);
    },

    updateAgentTask: () => unsupported("updateAgentTask"),

    updateReminder: (_clinicId, id, patch) => {
      if (patch.status === "sent") {
        port.updateReminderStatus(id, "sent");
        return;
      }
      unsupported("updateReminder.patch");
    },

    updateDocument: () => unsupported("updateDocument"),

    updateUrgentFlag: (_clinicId, id, patch) => {
      if (patch.handledAt) {
        port.escalateUrgentFlag(id);
        return;
      }
      unsupported("updateUrgentFlag.patch");
    },

    addInvite: () => unsupported("addInvite"),
    updateInvite: () => unsupported("updateInvite"),
    updateClinic: () => unsupported("updateClinic"),

    // 每个底层 Store 动作本身已经写审计；这里避免重复写两次。
    appendAudit: () => undefined,
  };
}
