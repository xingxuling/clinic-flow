import type { Permission, StaffRole } from "@/types/domain";
import type { ServiceVerticalPack } from "@/verticals/types";

/** 底层角色 key 保持兼容；默认可见标签使用通用服务业语义。 */
export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "負責人",
  practitioner: "服務人員",
  nurse: "服務助理",
  reception: "前台／客服",
  finance: "財務",
  readonly: "只讀",
};

export function roleLabelFor(vertical: ServiceVerticalPack, role: StaffRole): string {
  if (role === "owner") return "負責人";
  if (role === "reception") return vertical.mode === "field_service" ? "客服／調度" : "前台／客服";
  if (role === "finance") return "財務";
  if (role === "readonly") return "只讀";

  if (role === "practitioner") {
    switch (vertical.id) {
      case "dental":
      case "regulated-health":
        return "醫生／治療師";
      case "pet-care":
        return "美容師／照護員";
      case "auto-repair":
        return "技師";
      case "home-service":
        return "師傅／服務人員";
      case "beauty":
        return "美容師／服務人員";
      default:
        return "服務人員";
    }
  }

  switch (vertical.id) {
    case "dental":
    case "regulated-health":
      return "護士／助理";
    case "pet-care":
      return "照護助理";
    case "auto-repair":
      return "維修助理";
    case "home-service":
      return "服務助理";
    case "beauty":
      return "美容助理";
    default:
      return "服務助理";
  }
}

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "patient.read", label: "查看客戶資料" },
  { key: "patient.write", label: "編輯客戶資料" },
  { key: "appointment.read", label: "查看排程" },
  { key: "appointment.write", label: "編輯排程" },
  { key: "conversation.read", label: "查看對話" },
  { key: "conversation.reply", label: "回覆對話" },
  { key: "agent.approve", label: "批准 Agent 動作" },
  { key: "document.read", label: "查看行政資料" },
  { key: "document.write", label: "編輯行政資料" },
  { key: "staff.manage", label: "管理員工" },
  { key: "audit.read", label: "查看審計" },
  { key: "settings.write", label: "修改商戶設定" },
];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  owner: ALL_PERMISSIONS.map((permission) => permission.key),
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
