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
  { to: "/app/today", label: "今日", icon: LayoutDashboard, inBottomBar: true },
  { to: "/app/inbox", label: "對話", icon: MessageSquare, badgeKey: "inbox", inBottomBar: true },
  { to: "/app/appointments", label: "預約", icon: CalendarDays, inBottomBar: true },
  { to: "/app/agent", label: "Agent", icon: Bot, badgeKey: "agent", inBottomBar: true },
  { to: "/app/reminders", label: "提醒召回", icon: ClipboardList },
  { to: "/app/documents", label: "行政文件", icon: FileText, badgeKey: "documents" },
  { to: "/app/patients", label: "病人目錄", icon: Users },
  { to: "/app/staff", label: "員工權限", icon: UserCog },
  { to: "/app/audit", label: "審計日誌", icon: ScrollText },
  { to: "/app/settings", label: "診所設定", icon: Settings },
];
