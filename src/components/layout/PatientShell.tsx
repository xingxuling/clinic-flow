import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { MdIconButton } from "@/components/m3";
import { PATIENT_NAV_ITEMS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app-store";

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem("cinghe.theme");
    setDark(stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("cinghe.theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

/**
 * 病人前台 Shell。
 * 與行政後台完全獨立：沒有 Agent、審計、員工權限、病人目錄等內部功能入口，
 * 資訊密度明顯較低、手機優先。
 */
export function PatientShell({ children }: { children: ReactNode }) {
  const { clinic, me, signOutPatient } = useApp();
  const [dark, setDark] = useDarkMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-surface-container-lowest text-on-surface">
      {/* 桌面：輕量 Navigation Rail */}
      <nav className="sticky top-0 hidden h-screen w-28 shrink-0 flex-col items-center gap-2 bg-surface py-6 md:flex">
        {PATIENT_NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.to);
          return (
            <Link key={item.to} to={item.to} className="flex w-full flex-col items-center gap-1 py-1.5">
              <span
                className={cn(
                  "state-layer flex h-10 w-16 items-center justify-center rounded-full transition-colors",
                  active
                    ? "bg-tertiary-container text-on-tertiary-container"
                    : "text-on-surface-variant",
                )}
              >
                <item.icon className="size-5" />
              </span>
              <span className={cn("md-label-m", active ? "text-on-surface" : "text-on-surface-variant")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 bg-surface px-4 md:px-8">
          <div className="min-w-0 flex-1">
            <p className="md-title-m truncate text-on-surface">{clinic.name}</p>
            <p className="md-body-s truncate text-on-surface-variant">
              {me ? `${me.name}・個人空間` : "個人空間"}
            </p>
          </div>
          <MdIconButton onClick={() => setDark(!dark)} aria-label="切換深色模式">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </MdIconButton>
          <MdIconButton onClick={signOutPatient} aria-label="登出">
            <LogOut className="size-5" />
          </MdIconButton>
        </header>

        <main className="flex-1 pb-28 md:pb-10">{children}</main>
      </div>

      {/* 手機 Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-20 items-stretch bg-surface px-1 shadow-[0_-1px_0_var(--md-outline-variant)] md:hidden">
        {PATIENT_NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-1 flex-col items-center justify-center gap-1 pt-2"
            >
              <span
                className={cn(
                  "state-layer flex h-8 w-14 items-center justify-center rounded-full",
                  active
                    ? "bg-tertiary-container text-on-tertiary-container"
                    : "text-on-surface-variant",
                )}
              >
                <item.icon className="size-5" />
              </span>
              <span className={cn("md-label-m", active ? "text-on-surface" : "text-on-surface-variant")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PatientPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <h1 className="md-headline-s text-on-surface">{title}</h1>
      {subtitle && <p className="mt-1 md-body-m text-on-surface-variant">{subtitle}</p>}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}
