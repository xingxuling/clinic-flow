import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { PatientShell } from "@/components/layout/PatientShell";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/patient/_app")({
  component: PatientLayout,
});

function PatientLayout() {
  // 病人端只認 patientSession；員工 session 不能當作病人身分使用。
  const { hydrated, patientSession } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !patientSession) navigate({ to: "/patient/login" });
  }, [hydrated, patientSession, navigate]);

  if (!hydrated || !patientSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface md-body-m text-on-surface-variant">
        正在確認你的連結…
      </div>
    );
  }

  return (
    <PatientShell>
      <Outlet />
    </PatientShell>
  );
}
