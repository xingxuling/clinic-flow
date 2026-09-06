/**
 * Repository 資料層抽象
 *
 * 目前為 InMemoryRepository（示範資料）。
 * 未來替換為 PostgreSQL / Supabase 時，只需實作同一個 ClinicRepository 介面，
 * UI 與狀態機邏輯不需改動。所有方法都以 clinicId 為第一參數 —— 多租戶隔離在資料層強制執行。
 */
import type {
  Appointment,
  AppointmentStatus,
  AgentTask,
  AuditEvent,
  Clinic,
  Conversation,
  DocumentCase,
  ID,
  Invite,
  Patient,
  Reminder,
  Staff,
  UrgentFlag,
} from "@/types/domain";
import {
  seedAgentTasks,
  seedAppointments,
  seedAuditEvents,
  seedClinics,
  seedConversations,
  seedDocuments,
  seedPatientConversations,
  seedPatientDocuments,
  seedPatientHistory,
  seedInvites,
  seedPatients,
  seedReminders,
  seedStaff,
  seedUrgentFlags,
} from "./seed";

export interface ClinicRepository {
  getClinic(clinicId: ID): Clinic | undefined;
  listStaff(clinicId: ID): Staff[];
  listPatients(clinicId: ID): Patient[];
  listAppointments(clinicId: ID): Appointment[];
  listConversations(clinicId: ID): Conversation[];
  listUrgentFlags(clinicId: ID): UrgentFlag[];
  listAgentTasks(clinicId: ID): AgentTask[];
  listReminders(clinicId: ID): Reminder[];
  listDocuments(clinicId: ID): DocumentCase[];
  listInvites(clinicId: ID): Invite[];
  listAuditEvents(clinicId: ID): AuditEvent[];

  updatePatient(clinicId: ID, id: ID, patch: Partial<Patient>): void;
  updateAppointment(clinicId: ID, id: ID, patch: Partial<Appointment>): void;
  addAppointment(appointment: Appointment): void;
  updateConversation(clinicId: ID, id: ID, patch: Partial<Conversation>): void;
  updateAgentTask(clinicId: ID, id: ID, patch: Partial<AgentTask>): void;
  updateReminder(clinicId: ID, id: ID, patch: Partial<Reminder>): void;
  updateDocument(clinicId: ID, id: ID, patch: Partial<DocumentCase>): void;
  updateUrgentFlag(clinicId: ID, id: ID, patch: Partial<UrgentFlag>): void;
  addInvite(invite: Invite): void;
  updateInvite(clinicId: ID, id: ID, patch: Partial<Invite>): void;
  updateClinic(clinicId: ID, patch: Partial<Clinic>): void;
  appendAudit(event: AuditEvent): void;
}

interface Store {
  clinics: Clinic[];
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
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function createInMemoryStore(): Store {
  return clone({
    clinics: seedClinics,
    staff: seedStaff,
    patients: seedPatients,
    appointments: [...seedAppointments, ...seedPatientHistory],
    conversations: [...seedConversations, ...seedPatientConversations],
    urgentFlags: seedUrgentFlags,
    agentTasks: seedAgentTasks,
    reminders: seedReminders,
    documents: [...seedDocuments, ...seedPatientDocuments],
    invites: seedInvites,
    auditEvents: seedAuditEvents,
  });
}

export class InMemoryClinicRepository implements ClinicRepository {
  constructor(private store: Store = createInMemoryStore()) {}

  private scope<T extends { clinicId: ID }>(rows: T[], clinicId: ID): T[] {
    return rows.filter((r) => r.clinicId === clinicId);
  }

  private patch<T extends { id: ID; clinicId: ID }>(
    rows: T[],
    clinicId: ID,
    id: ID,
    p: Partial<T>,
  ): void {
    const i = rows.findIndex((r) => r.id === id && r.clinicId === clinicId);
    if (i >= 0) rows[i] = { ...rows[i], ...p } as T;
  }

  getClinic(clinicId: ID) {
    return this.store.clinics.find((c) => c.id === clinicId);
  }
  listStaff(clinicId: ID) {
    return this.scope(this.store.staff, clinicId);
  }
  listPatients(clinicId: ID) {
    return this.scope(this.store.patients, clinicId);
  }
  listAppointments(clinicId: ID) {
    return this.scope(this.store.appointments, clinicId).sort((a, b) =>
      a.startAt.localeCompare(b.startAt),
    );
  }
  listConversations(clinicId: ID) {
    return this.scope(this.store.conversations, clinicId).sort((a, b) =>
      b.lastAt.localeCompare(a.lastAt),
    );
  }
  listUrgentFlags(clinicId: ID) {
    return this.scope(this.store.urgentFlags, clinicId);
  }
  listAgentTasks(clinicId: ID) {
    return this.scope(this.store.agentTasks, clinicId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  listReminders(clinicId: ID) {
    return this.scope(this.store.reminders, clinicId).sort((a, b) =>
      a.dueAt.localeCompare(b.dueAt),
    );
  }
  listDocuments(clinicId: ID) {
    return this.scope(this.store.documents, clinicId);
  }
  listInvites(clinicId: ID) {
    return this.scope(this.store.invites, clinicId);
  }
  listAuditEvents(clinicId: ID) {
    return this.scope(this.store.auditEvents, clinicId).sort((a, b) => b.at.localeCompare(a.at));
  }

  updatePatient(clinicId: ID, id: ID, p: Partial<Patient>) {
    this.patch(this.store.patients, clinicId, id, p);
  }
  updateAppointment(clinicId: ID, id: ID, p: Partial<Appointment>) {
    this.patch(this.store.appointments, clinicId, id, p);
  }
  addAppointment(a: Appointment) {
    this.store.appointments.push(a);
  }
  updateConversation(clinicId: ID, id: ID, p: Partial<Conversation>) {
    this.patch(this.store.conversations, clinicId, id, p);
  }
  updateAgentTask(clinicId: ID, id: ID, p: Partial<AgentTask>) {
    this.patch(this.store.agentTasks, clinicId, id, p);
  }
  updateReminder(clinicId: ID, id: ID, p: Partial<Reminder>) {
    this.patch(this.store.reminders, clinicId, id, p);
  }
  updateDocument(clinicId: ID, id: ID, p: Partial<DocumentCase>) {
    this.patch(this.store.documents, clinicId, id, p);
  }
  updateUrgentFlag(clinicId: ID, id: ID, p: Partial<UrgentFlag>) {
    this.patch(this.store.urgentFlags, clinicId, id, p);
  }
  addInvite(i: Invite) {
    this.store.invites.push(i);
  }
  updateInvite(clinicId: ID, id: ID, p: Partial<Invite>) {
    this.patch(this.store.invites, clinicId, id, p);
  }
  updateClinic(clinicId: ID, p: Partial<Clinic>) {
    const i = this.store.clinics.findIndex((c) => c.id === clinicId);
    if (i >= 0) this.store.clinics[i] = { ...this.store.clinics[i], ...p } as Clinic;
  }
  appendAudit(e: AuditEvent) {
    this.store.auditEvents.push(e);
  }
}

/** 預約狀態機：允許的轉換 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["arrived", "no_show", "cancelled", "pending"],
  arrived: [],
  no_show: ["pending"],
  cancelled: ["pending"],
};

export function canTransitionAppointment(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}
