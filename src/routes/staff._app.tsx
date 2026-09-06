import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { StaffShell } from "@/components/layout/StaffShell";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/staff/_app")({
  head: () => ({
    meta: [
      { title: "工作台｜診所行政 Agent" },
      { name: "description", content: "診所行政後台工作區。" },
    ],
  }),
  component: AppLayout,
});

function AppLayout() {
  const { hydrated, session } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !session) navigate({ to: "/" });
  }, [hydrated, session, navigate]);

  if (!hydrated || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface md-body-m text-on-surface-variant">
        正在確認邀請狀態…
      </div>
    );
  }

  return (
    <StaffShell>
      <Outlet />
    </StaffShell>
  );
}
