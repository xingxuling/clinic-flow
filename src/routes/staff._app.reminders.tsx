import { createFileRoute } from "@tanstack/react-router";
import { BellRing, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import {
  EmptyState,
  MdButton,
  MdCard,
  MdChip,
  MdDialog,
  MdFilterChip,
  SectionHeader,
} from "@/components/m3";
import { buildAppointmentReminder } from "@/frontdesk/appointment-reminder";
import { CHANNEL, REMINDER_KIND, REMINDER_STATUS, fmtDateTime } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { ReminderKind } from "@/types/domain";

export const Route = createFileRoute("/staff/_app/reminders")({
  head: () => ({
    meta: [
      { title: "提醒與召回｜診所 AI 前台" },
      { name: "description", content: "就診前提醒與一鍵確認／改期／取消；洗牙召回等功能保留作第二階段。" },
    ],
  }),
  component: RemindersPage,
});

const KINDS: { value: ReminderKind | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pre_visit", label: "就診前提醒" },
  { value: "recall_cleaning", label: "洗牙召回" },
  { value: "vaccine", label: "疫苗／覆診" },
  { value: "followup", label: "覆診跟進" },
  { value: "no_reply", label: "未回覆跟進" },
];

function RemindersPage() {
  const {
    reminders,
    clinic,
    patients,
    appointments,
    staff,
    patientName,
    serviceName,
    updateReminderStatus,
  } = useApp();
  const [kind, setKind] = useState<ReminderKind | "all">("all");
  const [previewReminderId, setPreviewReminderId] = useState<string | null>(null);
  const list = reminders.filter((reminder) => kind === "all" || reminder.kind === kind);
  const overdue = reminders.filter((reminder) => reminder.status === "overdue");

  const preview = useMemo(() => {
    if (!previewReminderId) return null;
    const reminder = reminders.find((row) => row.id === previewReminderId);
    if (!reminder || reminder.kind !== "pre_visit") return null;
    const patient = patients.find((row) => row.id === reminder.patientId);
    if (!patient) return null;

    const appointment = appointments
      .filter(
        (row) =>
          row.patientId === reminder.patientId &&
          row.status !== "cancelled" &&
          new Date(row.startAt).getTime() > Date.now(),
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    if (!appointment) return null;
    const practitioner = staff.find((row) => row.id === appointment.practitionerId);
    if (!practitioner) return null;

    return buildAppointmentReminder({
      clinic,
      patient,
      appointment,
      practitioner,
      serviceName: serviceName(appointment.serviceId),
    });
  }, [appointments, clinic, patients, previewReminderId, reminders, serviceName, staff]);

  return (
    <PageContainer
      title="提醒與召回"
      subtitle={`第一階段：預約提醒 + 一鍵操作；現有規則：就診前 ${clinic.settings.reminderLeadHours.join(" / ")} 小時`}
    >
      <MdCard className="mb-5 bg-primary-container/45 p-4 text-on-primary-container">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="md-title-m">WhatsApp 預約提醒</p>
            <p className="mt-1 md-body-s">
              第一階段提醒訊息會直接帶「確認／改期／取消」按鈕。正式上線後由通道適配器發送，
              目前只預覽文案與按鈕協議，不接真實病人 WhatsApp。
            </p>
          </div>
        </div>
      </MdCard>

      {overdue.length > 0 && (
        <MdCard className="mb-5 flex items-center gap-3 bg-error-container p-4 text-on-error-container">
          <BellRing className="size-5 shrink-0" />
          <p className="md-body-m">有 {overdue.length} 項召回已逾期；召回自動化屬第二階段。</p>
        </MdCard>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <MdFilterChip key={item.value} selected={kind === item.value} onClick={() => setKind(item.value)}>
            {item.label}
          </MdFilterChip>
        ))}
      </div>

      <SectionHeader title="提醒排程" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text="沒有符合條件的提醒。" />
      ) : (
        <MdCard className="divide-y divide-outline-variant overflow-hidden">
          {list.map((reminder) => {
            const status = REMINDER_STATUS[reminder.status];
            return (
              <div key={reminder.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="md-title-m text-on-surface">{patientName(reminder.patientId)}</p>
                  <p className="md-body-s text-on-surface-variant">
                    {REMINDER_KIND[reminder.kind]}・{reminder.template}・{CHANNEL[reminder.channel]}
                  </p>
                </div>
                <p className="md-body-s text-on-surface-variant">{fmtDateTime(reminder.dueAt)}</p>
                <MdChip tone={status.tone}>{status.label}</MdChip>
                {(reminder.status === "scheduled" || reminder.status === "overdue") && (
                  <div className="flex flex-wrap gap-2">
                    {reminder.kind === "pre_visit" && (
                      <MdButton
                        size="sm"
                        variant="outlined"
                        icon={<MessageCircle className="size-4" />}
                        onClick={() => setPreviewReminderId(reminder.id)}
                      >
                        預覽 WhatsApp
                      </MdButton>
                    )}
                    <MdButton size="sm" variant="tonal" onClick={() => updateReminderStatus(reminder.id, "sent")}>
                      標記已發送
                    </MdButton>
                    <MdButton size="sm" variant="text" onClick={() => updateReminderStatus(reminder.id, "cancelled")}>
                      取消
                    </MdButton>
                  </div>
                )}
              </div>
            );
          })}
        </MdCard>
      )}

      <MdDialog
        open={previewReminderId !== null}
        onClose={() => setPreviewReminderId(null)}
        title="WhatsApp 預約提醒預覽"
      >
        {preview ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-container p-4">
              <p className="whitespace-pre-line md-body-m text-on-surface">{preview.text}</p>
            </div>
            <div>
              <p className="mb-2 md-label-l text-on-surface-variant">病人可直接按：</p>
              <div className="flex flex-wrap gap-2">
                {preview.replyOptions.map((option) => (
                  <MdChip key={option.id} tone="primary">
                    {option.label}
                  </MdChip>
                ))}
              </div>
            </div>
            <p className="md-body-s text-on-surface-variant">
              按鈕回傳後會進入統一預約適配器；改期會先查空檔，接近應診時間的改動自動轉人工。
            </p>
          </div>
        ) : (
          <EmptyState text="目前沒有可預覽的未來預約。" />
        )}
      </MdDialog>
    </PageContainer>
  );
}
