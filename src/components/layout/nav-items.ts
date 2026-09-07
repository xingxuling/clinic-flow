import {
  Bot,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  ScrollText,
  Settings,
  UserCircle,
  Users,
  UserCog,
} from "lucide-react";

import type { ServiceVerticalPack } from "@/verticals/types";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "inbox" | "agent" | "documents";
  inBottomBar?: boolean;
}

/**
 * 员工后台导航由行业包提供称谓，但路由和 Core 能力保持稳定。
 * 新行业不应复制一份 Navigation Shell。
 */
export function staffNavItemsFor(vertical: ServiceVerticalPack): NavItem[] {
  return [
    { to: "/staff/today", label: "今日", icon: LayoutDashboard, inBottomBar: true },
    { to: "/staff/inbox", label: "對話", icon: MessageSquare, badgeKey: "inbox", inBottomBar: true },
    { to: "/staff/appointments", label: vertical.labels.booking, icon: CalendarDays, inBottomBar: true },
    { to: "/staff/agent", label: "Agent", icon: Bot, badgeKey: "agent", inBottomBar: true },
    { to: "/staff/reminders", label: "跟進召回", icon: ClipboardList },
    { to: "/staff/documents", label: "行政資料", icon: FileText, badgeKey: "documents" },
    { to: "/staff/patients", label: `${vertical.labels.customer}目錄`, icon: Users },
    { to: "/staff/staff", label: "員工權限", icon: UserCog },
    { to: "/staff/audit", label: "審計日誌", icon: ScrollText },
    { to: "/staff/settings", label: "商戶設定", icon: Settings },
  ];
}

/** 兼容仍未迁移到 Vertical Context 的旧调用。 */
export const STAFF_NAV_ITEMS: NavItem[] = [
  { to: "/staff/today", label: "今日", icon: LayoutDashboard, inBottomBar: true },
  { to: "/staff/inbox", label: "對話", icon: MessageSquare, badgeKey: "inbox", inBottomBar: true },
  { to: "/staff/appointments", label: "預約", icon: CalendarDays, inBottomBar: true },
  { to: "/staff/agent", label: "Agent", icon: Bot, badgeKey: "agent", inBottomBar: true },
  { to: "/staff/reminders", label: "跟進召回", icon: ClipboardList },
  { to: "/staff/documents", label: "行政資料", icon: FileText, badgeKey: "documents" },
  { to: "/staff/patients", label: "客戶目錄", icon: Users },
  { to: "/staff/staff", label: "員工權限", icon: UserCog },
  { to: "/staff/audit", label: "審計日誌", icon: ScrollText },
  { to: "/staff/settings", label: "商戶設定", icon: Settings },
];

export interface PatientNavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

/** 旧牙科病人 Portal 暂时维持兼容，后续再迁成通用 Customer Portal。 */
export const PATIENT_NAV_ITEMS: PatientNavItem[] = [
  { to: "/patient/home", label: "首頁", icon: Home },
  { to: "/patient/appointments", label: "預約", icon: CalendarCheck },
  { to: "/patient/messages", label: "訊息", icon: MessageCircle },
  { to: "/patient/forms", label: "資料", icon: FileText },
  { to: "/patient/profile", label: "我的", icon: UserCircle },
];
