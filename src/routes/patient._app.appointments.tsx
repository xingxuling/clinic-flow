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
      { property: "og:title", content: "我的預約｜晴和牙科中心" },
      { property: "og:description", content: "查看、確認、改期或取消自己的診所預約。" },
    ],
  }),
  component: PatientAppointments,
});

type Tab = "upcoming" | "past";

function PatientAppointments() {
  const {
    myAppointments,
    staffName,
    serviceName,
    mySlots,
    myConfirmAppointment,
    myCancelAppointment,
    myRescheduleAppointment,
  } = useApp();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);

  const now = Date.now();
  const list = myAppointments
    .filter((a) =>
      tab === "upcoming"
        ? new Date(a.startAt).getTime() >= now && a.status !== "cancelled"
        : new Date(a.startAt).getTime() < now || a.status === "cancelled",
    )
    .sort((a, b) =>
      tab === "upcoming" ? a.startAt.localeCompare(b.startAt) : b.startAt.localeCompare(a.startAt),
    );

  const slots = reschedule ? mySlots(reschedule.practitionerId) : [];

  return (
    <PatientPage title="我的預約" subtitle="只顯示你本人的預約紀錄">
      <MdSegmented<Tab>
        value={tab}
        onChange={setTab}
        className="w-full"
        options={[
          { value: "upcoming", label: "將來" },
          { value: "past", label: "紀錄" },
        ]}
      />

      {list.length === 0 && (
        <MdCard variant="outlined" className="p-6 text-center md-body-m text-on-surface-variant">
          {tab === "upcoming" ? "暫時未有將來的預約。" : "未有過往紀錄。"}
        </MdCard>
      )}

      {list.map((a) => (
        <MdCard key={a.id} variant="outlined" className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="md-title-m text-on-surface">
                {fmtDate(a.startAt)}（{fmtWeekday(a.startAt)}）{fmtTime(a.startAt)}
              </p>
              <p className="mt-1 md-body-m text-on-surface-variant">
                {serviceName(a.serviceId)}・{staffName(a.practitionerId)}
              </p>
              {a.note && <p className="md-body-s text-on-surface-variant">{a.note}</p>}
            </div>
            <MdChip tone={APPOINTMENT_STATUS[a.status].tone}>{APPOINTMENT_STATUS[a.status].label}</MdChip>
          </div>

          {tab === "upcoming" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {a.status === "pending" && (
                <MdButton onClick={() => myConfirmAppointment(a.id)}>確認到診</MdButton>
              )}
              <MdButton variant="tonal" onClick={() => setReschedule(a)}>
                改期
              </MdButton>
              <MdButton variant="outlined" onClick={() => setCancelling(a)}>
                取消預約
              </MdButton>
            </div>
          )}
        </MdCard>
      ))}

      <p className="md-body-s text-on-surface-variant">
        24 小時內改期或取消，請直接致電診所，以便職員為你安排。
      </p>

      <MdDialog
        open={reschedule !== null}
        onClose={() => setReschedule(null)}
        title="選擇新時間"
      >
        <p className="mb-3 md-body-s text-on-surface-variant">
          以下為診所開放給你的空檔，選定後會重新等待診所確認。
        </p>
        <div className="max-h-80 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            {slots.map((s) => (
              <button
                key={s.startAt}
                type="button"
                className="state-layer rounded-2xl bg-surface-container p-3 text-left"
                onClick={() => {
                  if (reschedule) myRescheduleAppointment(reschedule.id, s.startAt);
                  setReschedule(null);
                }}
              >
                <span className="block md-label-l text-on-surface">
                  {fmtDate(s.startAt)}（{fmtWeekday(s.startAt)}）
                </span>
                <span className="block md-body-m text-on-surface-variant">{fmtTime(s.startAt)}</span>
              </button>
            ))}
            {slots.length === 0 && (
              <p className="col-span-2 md-body-m text-on-surface-variant">
                暫時未有可選空檔，請致電診所安排。
              </p>
            )}
          </div>
        </div>
      </MdDialog>

      <MdDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="確定取消預約？"
        actions={
          <>
            <MdButton variant="text" onClick={() => setCancelling(null)}>
              保留預約
            </MdButton>
            <MdButton
              onClick={() => {
                if (cancelling) myCancelAppointment(cancelling.id);
                setCancelling(null);
              }}
            >
              確定取消
            </MdButton>
          </>
        }
      >
        <p className="mb-2 md-body-s text-on-surface-variant">
          取消後如需重新安排，可在此頁再約或聯絡診所。
        </p>
        {cancelling && (
          <p className="md-body-m text-on-surface-variant">
            {fmtDate(cancelling.startAt)} {fmtTime(cancelling.startAt)}・
            {serviceName(cancelling.serviceId)}
          </p>
        )}
      </MdDialog>
    </PatientPage>
  );
}
