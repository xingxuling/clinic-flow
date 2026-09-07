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

import { STAFF_ROUTES, type CanonicalStaffRoute } from "@/routes/staff-route-contract";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface NavItem {
  to: CanonicalStaffRoute;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "inbox" | "agent" | "documents";
  inBottomBar?: boolean;
}

const STAFF_NAV_BASE: NavItem[] = [
  { to: STAFF_ROUTES.today, label: "今日", icon: LayoutDashboard, inBottomBar: true },
  { to: STAFF_ROUTES.inbox, label: "對話", icon: MessageSquare, badgeKey: "inbox", inBottomBar: true },
  { to: STAFF_ROUTES.bookings, label: "排程", icon: CalendarDays, inBottomBar: true },
  { to: STAFF_ROUTES.agent, label: "Agent", icon: Bot, badgeKey: "agent", inBottomBar: true },
  { to: STAFF_ROUTES.followUps, label: "跟進", icon: ClipboardList },
  { to: STAFF_ROUTES.customers, label: "客戶", icon: Users },
  { to: STAFF_ROUTES.documents, label: "資料", icon: FileText, badgeKey: "documents" },
  { to: STAFF_ROUTES.staff, label: "員工", icon: UserCog },
  { to: STAFF_ROUTES.audit, label: "審計", icon: ScrollText },
  { to: STAFF_ROUTES.settings, label: "設定", icon: Settings },
];

/**
 * Staff navigation uses short capability labels so every Vertical fits the same shell.
 * Industry-specific wording belongs inside each page, not in the narrow rail / bottom bar.
 */
export function staffNavItemsFor(_vertical: ServiceVerticalPack): NavItem[] {
  return STAFF_NAV_BASE;
}

/** Compatibility export for code that has not yet moved to Vertical Context. */
export const STAFF_NAV_ITEMS: NavItem[] = STAFF_NAV_BASE;

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
