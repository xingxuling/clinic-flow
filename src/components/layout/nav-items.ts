import {
  Bot,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Settings,
  Users,
  UserCog,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "inbox" | "agent" | "documents";
  inBottomBar?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/staff/today", label: "今日", icon: LayoutDashboard, inBottomBar: true },
  { to: "/staff/inbox", label: "對話", icon: MessageSquare, badgeKey: "inbox", inBottomBar: true },
  { to: "/staff/appointments", label: "預約", icon: CalendarDays, inBottomBar: true },
  { to: "/staff/agent", label: "Agent", icon: Bot, badgeKey: "agent", inBottomBar: true },
  { to: "/staff/reminders", label: "提醒召回", icon: ClipboardList },
  { to: "/staff/documents", label: "行政文件", icon: FileText, badgeKey: "documents" },
  { to: "/staff/patients", label: "病人目錄", icon: Users },
  { to: "/staff/staff", label: "員工權限", icon: UserCog },
  { to: "/staff/audit", label: "審計日誌", icon: ScrollText },
  { to: "/staff/settings", label: "診所設定", icon: Settings },
];
