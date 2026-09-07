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
 * Staff navigation uses short capability labels so every Vertical fits the same shell.
 * Industry-specific wording belongs inside each page, not in the narrow rail / bottom bar.
 */
export function staffNavItemsFor(_vertical: ServiceVerticalPack): NavItem[] {
  return [
    { to: "/staff/today", label: "今日", icon: LayoutDashboard, inBottomBar: true },
    { to: "/staff/inbox", label: "對話", icon: MessageSquare, badgeKey: "inbox", inBottomBar: true },
    { to: "/staff/bookings", label: "排程", icon: CalendarDays, inBottomBar: true },
    { to: "/staff/agent", label: "Agent", icon: Bot, badgeKey: "agent", inBottomBar: true },
    { to: "/staff/follow-ups", label: "跟進", icon: ClipboardList },
    { to: "/staff/customers", label: "客戶", icon: Users },
    { to: "/staff/documents", label: "資料", icon: FileText, badgeKey: "documents" },
    { to: "/staff/staff", label: "員工", icon: UserCog },
    { to: "/staff/audit", label: "審計", icon: ScrollText },
    { to: "/staff/settings", label: "設定", icon: Settings },
  ];
}

/** Compatibility export for code that has not yet moved to Vertical Context. */
export const STAFF_NAV_ITEMS: NavItem[] = [
  { to: "/staff/today", label: "今日", icon: LayoutDashboard, inBottomBar: true },
  { to: "/staff/inbox", label: "對話", icon: MessageSquare, badgeKey: "inbox", inBottomBar: true },
  { to: "/staff/bookings", label: "排程", icon: CalendarDays, inBottomBar: true },
  { to: "/staff/agent", label: "Agent", icon: Bot, badgeKey: "agent", inBottomBar: true },
  { to: "/staff/follow-ups", label: "跟進", icon: ClipboardList },
  { to: "/staff/customers", label: "客戶", icon: Users },
  { to: "/staff/documents", label: "資料", icon: FileText, badgeKey: "documents" },
  { to: "/staff/staff", label: "員工", icon: UserCog },
  { to: "/staff/audit", label: "審計", icon: ScrollText },
  { to: "/staff/settings", label: "設定", icon: Settings },
];

export interface PatientNavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

/** Dental-only compatibility portal; it is intentionally separate from staff canonical routes. */
export const PATIENT_NAV_ITEMS: PatientNavItem[] = [
  { to: "/patient/home", label: "首頁", icon: Home },
  { to: "/patient/appointments", label: "預約", icon: CalendarCheck },
  { to: "/patient/messages", label: "訊息", icon: MessageCircle },
  { to: "/patient/forms", label: "資料", icon: FileText },
  { to: "/patient/profile", label: "我的", icon: UserCircle },
];
