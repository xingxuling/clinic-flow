import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, MessageCircle, Phone, TriangleAlert } from "lucide-react";

import { PatientPage } from "@/components/layout/PatientShell";
import { MdButton, MdCard, MdChip } from "@/components/m3";
import { APPOINTMENT_STATUS, fmtDate, fmtTime, fmtWeekday } from "@/lib/labels";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/patient/_app/home")({
  head: () => ({
    meta: [
      { title: "我的診所｜晴和牙科中心" },
      { name: "description", content: "查看下次應診時間、確認到診、處理診所的待辦提示。" },
    ],
  }),
  component: PatientHome,
});

function PatientHome() {
  const {
    me,
    clinic,
    myAppointments,
    myReminders,
    myDocuments,
    myConversation,
    staffName,
    serviceName,
    myConfirmAppointment,
  } = useApp();

  const now = Date.now();
  const next = myAppointments
    .filter((a) => new Date(a.startAt).getTime() > now && a.status !== "cancelled")
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];

  const todos = [
    ...(next && next.status === "pending"
      ? [{ id: next.id, text: "請確認下次應診時間", to: "/patient/appointments" as const }]
      : []),
    ...myDocuments
      .filter((d) => d.missingFields.length > 0)
      .map((d) => ({ id: d.id, text: `${d.title}：仲欠 ${d.missingFields.join("、")}`, to: "/patient/forms" as const })),
  ];

  return (
    <PatientPage title={`你好，${me?.name ?? ""}`} subtitle={`${clinic.name}・${clinic.district}`}>
      <MdCard variant="filled" className="bg-tertiary-container p-5 text-on-tertiary-container">
        <p className="md-label-l opacity-80">下次應診</p>
        {next ? (
          <>
            <p className="mt-1 md-headline-s">
              {fmtDate(next.startAt)}（{fmtWeekday(next.startAt)}）{fmtTime(next.startAt)}
            </p>
            <p className="mt-1 md-body-m">
              {serviceName(next.serviceId)}・{staffName(next.practitionerId)}
            </p>
            <p className="md-body-s opacity-80">
              {clinic.name}・{next.room}
            </p>
            <div className="mt-3">
              <MdChip tone={APPOINTMENT_STATUS[next.status].tone}>
                {APPOINTMENT_STATUS[next.status].label}
              </MdChip>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {next.status === "pending" && (
                <MdButton onClick={() => myConfirmAppointment(next.id)}>確認到診</MdButton>
              )}
              <Link to="/patient/appointments">
                <MdButton variant="outlined">改期或取消</MdButton>
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-2 md-body-m">你暫時未有預約。可在「預約」頁查看紀錄或聯絡診所安排。</p>
        )}
      </MdCard>

      {todos.length > 0 && (
        <MdCard variant="outlined" className="p-4">
          <p className="md-title-m text-on-surface">待你處理</p>
          <div className="mt-3 flex flex-col gap-2">
            {todos.map((t) => (
              <Link
                key={t.id}
                to={t.to}
                className="state-layer flex items-center gap-3 rounded-2xl bg-surface-container p-3"
              >
                <CalendarCheck className="size-5 shrink-0 text-primary" />
                <span className="md-body-m flex-1 text-on-surface">{t.text}</span>
              </Link>
            ))}
          </div>
        </MdCard>
      )}

      {myReminders.length > 0 && (
        <MdCard variant="outlined" className="p-4">
          <p className="md-title-m text-on-surface">診所提醒</p>
          <ul className="mt-2 flex flex-col gap-2">
            {myReminders.slice(0, 3).map((r) => (
              <li key={r.id} className="md-body-m text-on-surface-variant">
                {fmtDate(r.dueAt)}・{r.template}
              </li>
            ))}
          </ul>
        </MdCard>
      )}

      <MdCard variant="outlined" className="p-4">
        <p className="md-title-m text-on-surface">聯絡診所</p>
        <p className="mt-1 md-body-s text-on-surface-variant">
          辦公時間內我們會盡快回覆；如情況緊急，請致電 999 或前往就近急症室。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/patient/messages">
            <MdButton variant="tonal" icon={<MessageCircle className="size-4" />}>
              傳訊息{myConversation ? "（已有對話）" : ""}
            </MdButton>
          </Link>
          <a href={`tel:${clinic.phone.replace(/\s/g, "")}`}>
            <MdButton variant="outlined" icon={<Phone className="size-4" />}>
              致電 {clinic.phone}
            </MdButton>
          </a>
        </div>
      </MdCard>

      <div className="flex items-start gap-2 rounded-2xl bg-surface-container p-4 md-body-s text-on-surface-variant">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-tertiary" />
        <p>此空間只處理預約與行政事宜，不提供網上診症或醫療建議。</p>
      </div>
    </PatientPage>
  );
}
