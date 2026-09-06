import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PatientPage } from "@/components/layout/PatientShell";
import { MdButton, MdCard, MdChip, MdDialog, MdSegmented } from "@/components/m3";
import { APPOINTMENT_STATUS, fmtDate, fmtTime, fmtWeekday } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { Appointment } from "@/types/domain";

export const Route = createFileRoute("/patient/_app/appointments")({
  head: () => ({
    meta: [
      { title: "我的預約｜晴和牙科中心" },
      { name: "description", content: "查看、確認、改期或取消自己的診所預約。" },
    ],
  }),
  component: PatientAppointments;
});

function PatientAppointments() {
  return null;
}
