import { Link, createFileRoute } from "@tanstack/react-router";
import { BellRing, CalendarClock, MessageCircle, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useServiceBookings } from "@/bookings/use-service-bookings";
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
import { useServiceCustomers } from "@/customers/use-service-customers";
import { buildBookingReminder } from "@/frontdesk/booking-reminder";
import { CHANNEL, REMINDER_STATUS, fmtDateTime } from "@/lib/labels";
import {
  createBookingReminderWorkItem,
  planBookingReminderCandidates,
} from "@/reminders/booking-reminder-planner";
import { useApp } from "@/state/app-store";
import type { ReminderKind } from "@/types/domain";
import { filterByVertical } from "@/verticals/entity-scope";
import { reminderKindFor } from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";
import {
  createFollowUpWorkItem,
  followUpWorkItemSourceRef,
} from "@/work-items/follow-up-work-item";
import { useServiceWorkItems } from "@/work-items/use-service-work-items";

export const Route = createFileRoute("/staff/_app/reminders")({
  head: () => ({
    meta: [
      { title: "跟進｜Service Frontdesk" },
      { name: "description", content: "通用服務業排程提醒、服務後跟進、召回與客戶喚醒。" },
    ],
  }),
  component: RemindersPage,
});

const KIND_VALUES: (ReminderKind | "all")[] = [
  "all",
  "pre_visit",
  "recall_cleaning",
  "vaccine",
  "followup",
  "no_reply",
];

function workItemStatusLabel(status: string): string {
  return {
    waiting_approval: "等待批准",
    ready_to_send: "待發送",
    done: "已完成",
    rejected: "已否決",
  }[status] ?? status;
}

function RemindersPage() {
  const {
    reminders,
    clinic,
    patients,
    appointments,
    staff,
    setAppointmentStatus,
    rescheduleAppointment,
    createAppointment,
    updateReminderStatus,
  } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customers, customerName } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const { bookings } = useServiceBookings({
    clinic,
    vertical,
    legacyAppointments: appointments,
    legacyActions: {
      setStatus: setAppointmentStatus,
      reschedule: rescheduleAppointment,
      create: createAppointment,
    },
  });
  const workItems = useServiceWorkItems(clinic.id, vertical.id);
  const [kind, setKind] = useState<ReminderKind | "all">("all");
  const [previewReminderId, setPreviewReminderId] = useState<string | null>(null);

  const visibleReminders = useMemo(
    () => filterByVertical(reminders, vertical.id),
    [reminders, vertical.id],
  );
  const list = visibleReminders.filter((reminder) => kind === "all" || reminder.kind === kind);
  const overdue = visibleReminders.filter((reminder) => reminder.status === "overdue");

  const importedFollowUps = useMemo(
    () =>
      customers
        .filter((customer) => customer.verticalId === vertical.id && customer.followUp?.dueAt)
        .sort((a, b) => (a.followUp?.dueAt ?? "").localeCompare(b.followUp?.dueAt ?? "")),
    [customers, vertical.id],
  );

  const workItemBySource = useMemo(
    () => new Map(workItems.filter((item) => item.sourceRef).map((item) => [item.sourceRef!, item])),
    [workItems],
  );

  const bookingReminderCandidates = useMemo(
    () =>
      planBookingReminderCandidates({
        vertical,
        timezone: clinic.timezone,
        reminderLeadHours: clinic.settings.reminderLeadHours,
        bookings,
        customers,
        resourceName: (resourceId) => staff.find((row) => row.id === resourceId)?.name,
      }),
    [bookings, clinic.settings.reminderLeadHours, clinic.timezone, customers, staff, vertical],
  );

  const preview = useMemo(() => {
    if (!previewReminderId) return null;
    const reminder = visibleReminders.find((row) => row.id === previewReminderId);
    if (!reminder || reminder.kind !== "pre_visit") return null;

    const booking = bookings
      .filter(
        (row) =>
          row.customerId === reminder.patientId &&
          row.status !== "cancelled" &&
          new Date(row.startAt).getTime() > Date.now(),
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    if (!booking) return null;
    const resource = staff.find((row) => row.id === booking.resourceId);
    const serviceName =
      vertical.services.find((service) => service.id === booking.serviceId)?.name ?? "服務";

    return buildBookingReminder({
      vertical,
      timezone: clinic.timezone,
      customerName: customerName(reminder.patientId),
      bookingId: booking.id,
      startAt: booking.startAt,
      serviceName,
      ...(resource?.name ? { resourceName: resource.name } : {}),
    });
  }, [bookings, clinic.timezone, customerName, previewReminderId, staff, vertical, visibleReminders]);

  return (
    <PageContainer
      title="跟進"
      subtitle={`${vertical.displayName} · ${vertical.labels.booking}提醒 · 服務後跟進 · 舊客戶喚醒`}
    >
      <MdCard className="mb-5 bg-primary-container/45 p-4 text-on-primary-container">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="md-title-m">訊息與提醒</p>
            <p className="mt-1 md-body-s">
              排程提醒可讓客戶直接確認、改期或取消；服務後跟進按已設定規則計算。
              待發訊息先經人工批准，只有已連接渠道真正回報成功後才標記完成。
            </p>
          </div>
        </div>
      </MdCard>

      {bookingReminderCandidates.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="排程提醒" count={bookingReminderCandidates.length} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bookingReminderCandidates.map((candidate) => {
              const workItem = workItemBySource.get(candidate.sourceRef);
              return (
                <MdCard key={candidate.sourceRef} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="md-title-m text-on-surface">{customerName(candidate.customerId)}</p>
                      <p className="md-body-s text-on-surface-variant">
                        {candidate.serviceName} · 提前 {candidate.leadHours} 小時
                      </p>
                    </div>
                    <MdChip tone={candidate.overdue ? "error" : "primary"}>
                      {candidate.overdue ? "已到提醒時間" : "待排程"}
                    </MdChip>
                  </div>

                  <div className="mt-3 rounded-xl bg-surface-container p-3">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-primary" />
                      <span className="md-label-m text-on-surface-variant">預計發送</span>
                    </div>
                    <p className="mt-1 md-body-m text-on-surface">{fmtDateTime(candidate.dueAt)}</p>
                  </div>

                  <p className="mt-3 line-clamp-3 whitespace-pre-line md-body-s text-on-surface-variant">
                    {candidate.reminder.text}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {candidate.reminder.replyOptions.map((option) => (
                      <MdChip key={option.id} tone="secondary">{option.label}</MdChip>
                    ))}
                  </div>

                  {workItem && (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary-container/45 p-3">
                      <span className="md-body-s text-on-secondary-container">
                        待辦：{workItemStatusLabel(workItem.status)}
                      </span>
                      <Link to="/staff/agent" className="md-label-l text-primary">查看</Link>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <MdButton
                      size="sm"
                      variant={workItem ? "outlined" : "tonal"}
                      onClick={() => {
                        try {
                          const item = createBookingReminderWorkItem({
                            tenantId: clinic.id,
                            vertical,
                            candidate,
                          });
                          toast.success(workItem ? "提醒待辦已存在" : "提醒已加入 Agent 待辦", {
                            description: workItemStatusLabel(item.status),
                          });
                        } catch (error) {
                          toast.error("無法建立提醒待辦", {
                            description: error instanceof Error ? error.message : String(error),
                          });
                        }
                      }}
                    >
                      {workItem ? "已建立待辦" : "建立提醒待辦"}
                    </MdButton>
                    {workItem && (
                      <Link to="/staff/agent"><MdButton size="sm" variant="text">前往 Agent</MdButton></Link>
                    )}
                  </div>
                </MdCard>
              );
            })}
          </div>
        </section>
      )}

      {importedFollowUps.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="舊資料產生的跟進" count={importedFollowUps.length} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {importedFollowUps.map((customer) => {
              const sourceRef = followUpWorkItemSourceRef(customer);
              const workItem = sourceRef ? workItemBySource.get(sourceRef) : undefined;
              return (
                <MdCard key={customer.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="md-title-m text-on-surface">{customer.displayName}</p>
                      <p className="md-body-s text-on-surface-variant">
                        {customer.followUp?.lastService ?? "既有服務"}
                        {customer.followUp?.lastServiceDate ? ` · ${customer.followUp.lastServiceDate}` : ""}
                      </p>
                    </div>
                    <MdChip tone={customer.followUp?.dueAt && new Date(customer.followUp.dueAt) <= new Date() ? "error" : "tertiary"}>
                      {customer.followUp?.ruleLabel ?? "跟進"}
                    </MdChip>
                  </div>
                  <div className="mt-3 rounded-xl bg-surface-container p-3">
                    <p className="md-label-m text-on-surface-variant">建議時間</p>
                    <p className="mt-1 md-body-m text-on-surface">
                      {customer.followUp?.dueAt ? fmtDateTime(customer.followUp.dueAt) : "待確認"}
                    </p>
                  </div>
                  <p className="mt-3 md-body-s text-on-surface-variant">
                    {customer.followUp?.customerMessage ?? customer.followUp?.followUpHint ?? "等待商戶確認跟進方式。"}
                  </p>

                  {workItem && (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary-container/45 p-3">
                      <span className="md-body-s text-on-secondary-container">
                        待辦：{workItemStatusLabel(workItem.status)}
                      </span>
                      <Link to="/staff/agent" className="md-label-l text-primary">查看</Link>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <MdButton
                      size="sm"
                      variant={workItem ? "outlined" : "tonal"}
                      icon={<MessageCircle className="size-4" />}
                      onClick={() => {
                        try {
                          const item = createFollowUpWorkItem({ customer, vertical });
                          toast.success(workItem ? "跟進待辦已存在" : "跟進草稿已加入 Agent 待辦", {
                            description: workItemStatusLabel(item.status),
                          });
                        } catch (error) {
                          toast.error("無法建立跟進待辦", {
                            description: error instanceof Error ? error.message : String(error),
                          });
                        }
                      }}
                    >
                      {workItem ? "已建立草稿" : "建立跟進草稿"}
                    </MdButton>
                    {workItem && (
                      <Link to="/staff/agent"><MdButton size="sm" variant="text">前往 Agent</MdButton></Link>
                    )}
                  </div>
                </MdCard>
              );
            })}
          </div>
        </section>
      )}

      {overdue.length > 0 && (
        <MdCard className="mb-5 flex items-center gap-3 bg-error-container p-4 text-on-error-container">
          <BellRing className="size-5 shrink-0" />
          <p className="md-body-m">有 {overdue.length} 項既有牙科跟進已逾期。</p>
        </MdCard>
      )}

      {visibleReminders.length > 0 && (
        <section>
          <div className="mb-4 flex flex-wrap gap-2">
            {KIND_VALUES.map((value) => (
              <MdFilterChip key={value} selected={kind === value} onClick={() => setKind(value)}>
                {value === "all" ? "全部" : reminderKindFor(vertical, value)}
              </MdFilterChip>
            ))}
          </div>

          <SectionHeader title="既有牙科提醒" count={list.length} />
          {list.length === 0 ? (
            <EmptyState text="沒有符合條件的既有提醒。" />
          ) : (
            <MdCard className="divide-y divide-outline-variant overflow-hidden">
              {list.map((reminder) => {
                const status = REMINDER_STATUS[reminder.status];
                return (
                  <div key={reminder.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="md-title-m text-on-surface">{customerName(reminder.patientId)}</p>
                      <p className="md-body-s text-on-surface-variant">
                        {reminderKindFor(vertical, reminder.kind)} · {reminder.template} · {CHANNEL[reminder.channel]}
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
        </section>
      )}

      <MdDialog
        open={previewReminderId !== null}
        onClose={() => setPreviewReminderId(null)}
        title={`${vertical.labels.booking}提醒預覽`}
      >
        {preview ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-container p-4">
              <p className="whitespace-pre-line md-body-m text-on-surface">{preview.text}</p>
            </div>
            <div>
              <p className="mb-2 md-label-l text-on-surface-variant">{vertical.labels.customer}可直接按：</p>
              <div className="flex flex-wrap gap-2">
                {preview.replyOptions.map((option) => <MdChip key={option.id} tone="primary">{option.label}</MdChip>)}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState text={`目前沒有可預覽的未來${vertical.labels.booking}。`} />
        )}
      </MdDialog>

      <div className="mt-5 flex items-center gap-2 md-body-s text-on-surface-variant">
        <RotateCcw className="size-4" /> 提醒與跟進依據排程和已確認規則計算；AI 不會自行決定專業週期。
      </div>
    </PageContainer>
  );
}
