import type { Permission, StaffRole } from "@/types/domain";

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "負責人",
  practitioner: "醫生／治療師",
  nurse: "護士／助理",
  reception: "前台",
  finance: "財務",
  readonly: "只讀",
};

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "patient.read", label: "查看病人" },
  { key: "patient.write", label: "編輯病人" },
  { key: "appointment.read", label: "查看預約" },
  { key: "appointment.write", label: "編輯預約" },
  { key: "conversation.read", label: "查看對話" },
  { key: "conversation.reply", label: "回覆對話" },
  { key: "agent.approve", label: "批准 Agent" },
  { key: "document.read", label: "查看文件" },
  { key: "document.write", label: "編輯文件" },
  { key: "staff.manage", label: "管理員工" },
  { key: "audit.read", label: "查看審計" },
  { key: "settings.write", label: "修改設定" },
];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  owner: ALL_PERMISSIONS.map((p) => p.key),
  practitioner: [
    "patient.read",
    "appointment.read",
    "appointment.write",
    "conversation.read",
    "conversation.reply",
    "agent.approve",
    "document.read",
  ],
  nurse: [
    "patient.read",
    "appointment.read",
    "appointment.write",
    "conversation.read",
    "conversation.reply",
    "document.read",
  ],
  reception: [
    "patient.read",
    "patient.write",
    "appointment.read",
    "appointment.write",
    "conversation.read",
    "conversation.reply",
    "agent.approve",
    "document.read",
  ],
  finance: ["patient.read", "appointment.read", "document.read", "document.write", "audit.read"],
  readonly: ["patient.read", "appointment.read", "conversation.read", "document.read"],
};

export function hasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
