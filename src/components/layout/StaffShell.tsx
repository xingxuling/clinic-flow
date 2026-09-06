import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, Moon, Stethoscope, Sun, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { MdBadge, MdIconButton } from "@/components/m3";
import { STAFF_NAV_ITEMS } from "@/components/layout/nav-items";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app-store";

function useBadges() {
  const { conversations, agentTasks, documents } = useApp();
  return {
    inbox: conversations.filter((c) => c.unread).length,
    agent: agentTasks.filter((t) => t.status === "waiting_approval").length,
    documents: documents.filter((d) => d.status === "anomaly" || d.status === "needs_fields").length,
  };
}

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem("cinghe.theme");
    const initial = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(initial);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("cinghe.theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

export function StaffShell({ children }: { children: ReactNode }) {
  const { clinic, currentStaff, signOutStaff } = useApp();
  const badges = useBadges();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dark, setDark] = useDarkMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const bottomItems = STAFF_NAV_ITEMS.filter((i) => i.inBottomBar);

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      {/* Navigation Rail（桌面） */}
      <nav className="sticky top-0 hidden h-screen w-24 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-surface-container py-4 md:flex">
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
          <Stethoscope className="size-6" />
        </div>
        {STAFF_NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.to);
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="group flex w-full flex-col items-center gap-1 py-1.5"
            >
              <span
                className={cn(
                  "state-layer relative flex h-8 w-14 items-center justify-center rounded-2xl transition-colors",
                  active
                    ? "bg-secondary-container text-on-secondary-container"
                    : "text-on-surface-variant",
                )}
              >
                <item.icon className="size-5" />
                {badge > 0 && <MdBadge count={badge} className="absolute -right-0.5 -top-1" />}
              </span>
              <span
                className={cn(
                  "md-label-m text-center leading-tight",
                  active ? "text-on-surface" : "text-on-surface-variant",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top app bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-outline-variant bg-surface px-3 md:px-6">
          <MdIconButton className="md:hidden" onClick={() => setDrawerOpen(true)} aria-label="開啟選單">
            <Menu className="size-5" />
          </MdIconButton>
          <div className="min-w-0 flex-1">
            <p className="md-title-m truncate text-on-surface">
              {clinic.name}
              <span className="ml-2 rounded-full bg-secondary-container px-2 py-0.5 md-label-m text-on-secondary-container">
                行政後台
              </span>
            </p>
            <p className="md-body-s truncate text-on-surface-variant">
              {clinic.district}・{currentStaff.name}（{ROLE_LABEL[currentStaff.role]}）
            </p>
          </div>
          <MdIconButton onClick={() => setDark(!dark)} aria-label="切換深色模式">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </MdIconButton>
          <MdIconButton onClick={signOutStaff} aria-label="登出">
            <LogOut className="size-5" />
          </MdIconButton>
        </header>

        <main className="flex-1 pb-24 md:pb-8">{children}</main>
      </div>

      {/* Bottom Navigation（手機） */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-20 items-stretch border-t border-outline-variant bg-surface-container px-1 md:hidden">
        {bottomItems.map((item) => {
          const active = pathname.startsWith(item.to);
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-1 flex-col items-center justify-center gap-1 pt-2"
            >
              <span
                className={cn(
                  "state-layer relative flex h-8 w-16 items-center justify-center rounded-2xl",
                  active
                    ? "bg-secondary-container text-on-secondary-container"
                    : "text-on-surface-variant",
                )}
              >
                <item.icon className="size-5" />
                {badge > 0 && <MdBadge count={badge} className="absolute -right-1 -top-1" />}
              </span>
              <span className={cn("md-label-m", active ? "text-on-surface" : "text-on-surface-variant")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Modal Navigation Drawer（手機） */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-inverse-surface/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative h-full w-80 max-w-[85vw] overflow-y-auto rounded-r-3xl bg-surface-container-low p-3">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="md-title-m">全部功能</span>
              <MdIconButton onClick={() => setDrawerOpen(false)} aria-label="關閉選單">
                <X className="size-5" />
              </MdIconButton>
            </div>
            {STAFF_NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.to);
              const badge = item.badgeKey ? badges[item.badgeKey] : 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    "state-layer mb-1 flex h-14 items-center gap-3 rounded-full px-4",
                    active
                      ? "bg-secondary-container text-on-secondary-container"
                      : "text-on-surface-variant",
                  )}
                >
                  <item.icon className="size-5" />
                  <span className="md-label-l flex-1">{item.label}</span>
                  <MdBadge count={badge} />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function PageContainer({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="md-headline-s text-on-surface">{title}</h1>
          {subtitle && <p className="mt-1 md-body-m text-on-surface-variant">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
