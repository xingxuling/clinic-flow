import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { InMemoryClinicRepository, canTransitionAppointment } from "@/data/repository";
import { canTransitionAgentTask } from "@/lib/agent-rules";
import { hasPermission } from "@/lib/permissions";
import type {
  ActorRef,
  Appointment,
  AppointmentStatus,
  AuditEvent,
  Clinic,
  ID,
  Invite,
  Permission,
  Session,
  StaffRole,
} from "@/types/domain";

const SESSION_KEY = "cinghe.session.v1";
const repo = new InMemoryClinicRepository();

export interface NewAppointmentInput {
  patientId: ID;
  practitionerId: ID;
  serviceId: ID;
  startAt: string;
  durationMin: number;
  room: string;
  note: string;
}

interface AppStoreValue {
  hydrated: boolean;
  session: Session | null;
  signIn: (input: { code: string; method: Session["method"] }) => boolean;
  signOut: () => void;

  clinic: Clinic;
  currentStaff: ReturnType<typeof repo.listStaff>[number];
  can: (p: Permission) => boolean;

  staff: ReturnType<typeof repo.listStaff>;
  patients: ReturnType<typeof repo.listPatients>;
  appointments: ReturnType<typeof repo.listAppointments>;
  conversations: ReturnType<typeof repo.listConversations>;
  urgentFlags: ReturnType<typeof repo.listUrgentFlags>;
  agentTasks: ReturnType<typeof repo.listAgentTasks>;
  reminders: ReturnType<typeof repo.listReminders>;
  documents: ReturnType<typeof repo.listDocuments>;
  invites: ReturnType<typeof repo.listInvites>;
  auditEvents: ReturnType<typeof repo.listAuditEvents>;

  patientName: (id: ID) => string;
  staffName: (id: ID) => string;
  serviceName: (id: ID) => string;

  setAppointmentStatus: (id: ID, to: AppointmentStatus) => void;
  rescheduleAppointment: (id: ID, startAt: string) => void;
  createAppointment: (input: NewAppointmentInput) => void;

  takeOverConversation: (id: ID) => void;
  sendReply: (id: ID, text: string) => void;
  sendAgentDraft: (id: ID, messageId: ID) => void;

  decideAgentTask: (id: ID, approve: boolean) => void;
  retryAgentTask: (id: ID) => void;

  updateReminderStatus: (id: ID, status: "cancelled" | "sent") => void;
  markDocumentReady: (id: ID) => void;
  escalateUrgentFlag: (id: ID) => void;

  createInvite: (input: { inviteeName: string; role: StaffRole }) => Invite;
  revokeInvite: (id: ID) => void;

  updateClinicSettings: (patch: Partial<Clinic>) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

const DEMO_CLINIC_ID = "clinic_cinghe";
const DEMO_STAFF_ID = "staff_reception";
export const DEMO_INVITE_CODES = ["CINGHE-2026", "CINGHE-NURSE-77"];

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setSession(readSession());
    setHydrated(true);
  }, []);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const seq = useRef(0);
  const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${seq.current++}`;

  const clinicId = session?.clinicId ?? DEMO_CLINIC_ID;
  const staffId = session?.staffId ?? DEMO_STAFF_ID;

  const clinic = repo.getClinic(clinicId)!;
  const staff = repo.listStaff(clinicId);
  const currentStaff = staff.find((s) => s.id === staffId) ?? staff[0]!;

  const actor = useMemo<ActorRef>(
    () => ({ type: "staff", id: currentStaff.id, name: currentStaff.name }),
    [currentStaff.id, currentStaff.name],
  );

  const audit = useCallback(
    (e: Omit<AuditEvent, "id" | "clinicId" | "at" | "actor"> & { actor?: ActorRef }) => {
      repo.appendAudit({
        id: nextId("au"),
        clinicId,
        at: new Date().toISOString(),
        actor: e.actor ?? actor,
        action: e.action,
        target: e.target,
        result: e.result,
        detail: e.detail,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clinicId, actor],
  );

  const can = useCallback(
    (p: Permission) => hasPermission(currentStaff.role, p),
    [currentStaff.role],
  );

  const guard = useCallback(
    (p: Permission, action: string, target: string) => {
      if (can(p)) return true;
      audit({ action, target, result: "blocked", detail: `角色 ${currentStaff.role} 缺少 ${p}` });
      toast.error("權限不足", { description: `你的角色沒有「${p}」權限，操作已被記錄。` });
      bump();
      return false;
    },
    [can, audit, bump, currentStaff.role],
  );

  const patients = repo.listPatients(clinicId);
  const patientName = (id: ID) => patients.find((p) => p.id === id)?.name ?? "未知病人";
  const staffName = (id: ID) => staff.find((s) => s.id === id)?.name ?? "未指派";
  const serviceName = (id: ID) => clinic.services.find((s) => s.id === id)?.name ?? "其他服務";

  const value: AppStoreValue = {
    hydrated,
    session,
    signIn: ({ code, method }) => {
      const invite = repo
        .listInvites(DEMO_CLINIC_ID)
        .find((i) => i.code.toUpperCase() === code.trim().toUpperCase() && i.status === "pending");
      if (!invite && method === "code") return false;
      const s: Session = {
        clinicId: DEMO_CLINIC_ID,
        staffId: DEMO_STAFF_ID,
        deviceBound: true,
        method,
        at: new Date().toISOString(),
      };
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      repo.appendAudit({
        id: nextId("au"),
        clinicId: DEMO_CLINIC_ID,
        at: s.at,
        actor: { type: "staff", id: DEMO_STAFF_ID, name: "李樂怡" },
        action: "登入系統",
        target: method === "code" ? `邀請密令 ${invite?.code}` : method === "qr" ? "二維碼邀請" : "Passkey",
        result: "success",
        detail: "示範裝置已綁定",
      });
      bump();
      return true;
    },
    signOut: () => {
      window.localStorage.removeItem(SESSION_KEY);
      setSession(null);
    },

    clinic,
    currentStaff,
    can,

    staff,
    patients,
    appointments: repo.listAppointments(clinicId),
    conversations: repo.listConversations(clinicId),
    urgentFlags: repo.listUrgentFlags(clinicId),
    agentTasks: repo.listAgentTasks(clinicId),
    reminders: repo.listReminders(clinicId),
    documents: repo.listDocuments(clinicId),
    invites: repo.listInvites(clinicId),
    auditEvents: repo.listAuditEvents(clinicId),

    patientName,
    staffName,
    serviceName,

    setAppointmentStatus: (id, to) => {
      if (!guard("appointment.write", "更改預約狀態", `預約 ${id}`)) return;
      const ap = repo.listAppointments(clinicId).find((a) => a.id === id);
      if (!ap) return;
      if (!canTransitionAppointment(ap.status, to)) {
        toast.error("不允許的狀態轉換", { description: "此預約狀態不可如此變更。" });
        return;
      }
      repo.updateAppointment(clinicId, id, { status: to });
      audit({
        action: "更改預約狀態",
        target: `預約 ${id}`,
        result: "success",
        detail: `${ap.status} → ${to}`,
      });
      toast.success("預約已更新");
      bump();
    },

    rescheduleAppointment: (id, startAt) => {
      if (!guard("appointment.write", "改期", `預約 ${id}`)) return;
      const ap = repo.listAppointments(clinicId).find((a) => a.id === id);
      if (!ap) return;
      const dur = new Date(ap.endAt).getTime() - new Date(ap.startAt).getTime();
      const endAt = new Date(new Date(startAt).getTime() + dur).toISOString();
      repo.updateAppointment(clinicId, id, { startAt, endAt, status: "pending" });
      audit({ action: "預約改期", target: `預約 ${id}`, result: "success", detail: startAt });
      toast.success("已改期，狀態回到待確認");
      bump();
    },

    createAppointment: (input) => {
      if (!guard("appointment.write", "新增預約", "預約")) return;
      const startAt = input.startAt;
      const endAt = new Date(
        new Date(startAt).getTime() + input.durationMin * 60_000,
      ).toISOString();
      const ap: Appointment = {
        id: nextId("ap"),
        clinicId,
        patientId: input.patientId,
        practitionerId: input.practitionerId,
        serviceId: input.serviceId,
        startAt,
        endAt,
        status: "pending",
        room: input.room,
        note: input.note,
        createdBy: actor,
      };
      repo.addAppointment(ap);
      audit({ action: "新增預約", target: `預約 ${ap.id}`, result: "success", detail: startAt });
      toast.success("已新增預約（待確認）");
      bump();
    },

    takeOverConversation: (id) => {
      if (!guard("conversation.reply", "人工接管對話", `對話 ${id}`)) return;
      repo.updateConversation(clinicId, id, {
        state: "human",
        assignedTo: currentStaff.id,
        unread: false,
      });
      audit({ action: "人工接管對話", target: `對話 ${id}`, result: "success", detail: "Agent 已停止自動回覆" });
      toast.success("已接管，Agent 停止自動回覆");
      bump();
    },

    sendReply: (id, text) => {
      if (!guard("conversation.reply", "回覆訊息", `對話 ${id}`)) return;
      const cv = repo.listConversations(clinicId).find((c) => c.id === id);
      if (!cv) return;
      const now = new Date().toISOString();
      repo.updateConversation(clinicId, id, {
        state: "human",
        assignedTo: currentStaff.id,
        unread: false,
        lastAt: now,
        messages: [
          ...cv.messages,
          {
            id: nextId("m"),
            conversationId: id,
            from: "staff",
            authorName: currentStaff.name,
            text,
            at: now,
          },
        ],
      });
      audit({ action: "發送訊息", target: `對話 ${id}`, result: "success", detail: text.slice(0, 40) });
      bump();
    },

    sendAgentDraft: (id, messageId) => {
      if (!guard("conversation.reply", "批准 Agent 草稿", `對話 ${id}`)) return;
      const cv = repo.listConversations(clinicId).find((c) => c.id === id);
      if (!cv) return;
      repo.updateConversation(clinicId, id, {
        lastAt: new Date().toISOString(),
        messages: cv.messages.map((m) => (m.id === messageId ? { ...m, draft: false } : m)),
      });
      audit({ action: "批准並發送 Agent 草稿", target: `對話 ${id}`, result: "success", detail: messageId });
      toast.success("草稿已發送");
      bump();
    },

    decideAgentTask: (id, approve) => {
      if (!guard("agent.approve", approve ? "批准 Agent 任務" : "否決 Agent 任務", `任務 ${id}`)) return;
      const t = repo.listAgentTasks(clinicId).find((x) => x.id === id);
      if (!t) return;
      const to = approve ? "done" : "rejected";
      if (!canTransitionAgentTask(t.status, to)) {
        toast.error("此任務目前不可批核");
        return;
      }
      repo.updateAgentTask(clinicId, id, {
        status: to,
        decidedBy: currentStaff.id,
        decidedAt: new Date().toISOString(),
      });
      audit({
        action: approve ? "批准 Agent 任務" : "否決 Agent 任務",
        target: `任務 ${id}`,
        result: "success",
        detail: t.title,
      });
      toast.success(approve ? "已批准，Agent 將執行" : "已否決");
      bump();
    },

    retryAgentTask: (id) => {
      if (!guard("agent.approve", "重試 Agent 任務", `任務 ${id}`)) return;
      repo.updateAgentTask(clinicId, id, { status: "waiting_approval", failureReason: undefined });
      audit({ action: "重試 Agent 任務", target: `任務 ${id}`, result: "success", detail: "轉為等待人工批准" });
      bump();
    },

    updateReminderStatus: (id, status) => {
      if (!guard("appointment.write", "更新提醒", `提醒 ${id}`)) return;
      repo.updateReminder(clinicId, id, { status });
      audit({ action: "更新提醒", target: `提醒 ${id}`, result: "success", detail: status });
      toast.success(status === "sent" ? "已標記為已發送" : "已取消提醒");
      bump();
    },

    markDocumentReady: (id) => {
      if (!guard("document.write", "更新文件", `文件 ${id}`)) return;
      repo.updateDocument(clinicId, id, { status: "ready", updatedAt: new Date().toISOString() });
      audit({ action: "標記文件可發出", target: `文件 ${id}`, result: "success", detail: "人工覆核完成" });
      toast.success("文件已標記為可發出");
      bump();
    },

    escalateUrgentFlag: (id) => {
      if (!guard("conversation.reply", "轉人工處理緊急標記", `標記 ${id}`)) return;
      const flag = repo.listUrgentFlags(clinicId).find((f) => f.id === id);
      if (!flag) return;
      repo.updateUrgentFlag(clinicId, id, {
        handledBy: currentStaff.id,
        handledAt: new Date().toISOString(),
      });
      repo.updateConversation(clinicId, flag.conversationId, {
        state: "human",
        assignedTo: currentStaff.id,
        unread: false,
      });
      audit({ action: "緊急標記轉人工", target: `標記 ${id}`, result: "success", detail: flag.rule });
      toast.success("已轉人工跟進");
      bump();
    },

    createInvite: ({ inviteeName, role }) => {
      const invite: Invite = {
        id: nextId("iv"),
        clinicId,
        code: `CINGHE-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        role,
        inviteeName,
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      };
      if (!can("staff.manage")) {
        audit({ action: "建立邀請", target: inviteeName, result: "blocked", detail: "缺少 staff.manage" });
        toast.error("權限不足", { description: "只有負責人可以邀請員工。" });
        bump();
        return invite;
      }
      repo.addInvite(invite);
      audit({ action: "建立邀請", target: invite.code, result: "success", detail: role });
      bump();
      return invite;
    },

    revokeInvite: (id) => {
      if (!guard("staff.manage", "撤銷邀請", `邀請 ${id}`)) return;
      repo.updateInvite(clinicId, id, { status: "revoked" });
      audit({ action: "撤銷邀請", target: `邀請 ${id}`, result: "success", detail: "" });
      bump();
    },

    updateClinicSettings: (patch) => {
      if (!guard("settings.write", "修改診所設定", clinic.name)) return;
      repo.updateClinic(clinicId, patch);
      audit({ action: "修改診所設定", target: clinic.name, result: "success", detail: Object.keys(patch).join(",") });
      toast.success("設定已儲存");
      bump();
    },
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useApp(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useApp 必須在 AppStoreProvider 內使用");
  return ctx;
}
