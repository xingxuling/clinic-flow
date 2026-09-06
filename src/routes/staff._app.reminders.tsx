import { createFileRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/AppShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip, SectionHeader } from "@/components/m3";
import { CHANNEL, REMINDER_KIND, REMINDER_STATUS, fmtDateTime } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { ReminderKind } from "@/types/domain";

export const Route = createFileRoute("/staff/_app/reminders")({
  head: () => ({
    meta: [
      { title: "提醒與召回｜診所行政 Agent" },
      { name: "description", content: "就診前提醒、洗牙 6／12 個月召回、疫苗覆診模板與未回覆跟進。" },
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
  const { reminders, clinic, patientName, updateReminderStatus } = useApp();
  const [kind, setKind] = useState<ReminderKind | "all">("all");
  const list = reminders.filter((r) => kind === "all" || r.kind === kind);
  const overdue = reminders.filter((r) => r.status === "overdue");

  return (
    <PageContainer
      title="提醒與召回"
      subtitle={`規則：就診前 ${clinic.settings.reminderLeadHours.join(" / ")} 小時；召回 ${clinic.settings.recallMonths.join(" / ")} 個月`}
    >
      {overdue.length > 0 && (
        <MdCard className="mb-5 flex items-center gap-3 bg-error-container p-4 text-on-error-container">
          <BellRing className="size-5 shrink-0" />
          <p className="md-body-m">有 {overdue.length} 項召回已逾期，建議今日安排跟進電話。</p>
        </MdCard>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <MdFilterChip key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)}>
            {k.label}
          </MdFilterChip>
        ))}
      </div>

      <SectionHeader title="提醒排程" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text="沒有符合條件的提醒。" />
      ) : (
        <MdCard className="divide-y divide-outline-variant overflow-hidden">
          {list.map((r) => {
            const s = REMINDER_STATUS[r.status];
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="md-title-m text-on-surface">{patientName(r.patientId)}</p>
                  <p className="md-body-s text-on-surface-variant">
                    {REMINDER_KIND[r.kind]}・{r.template}・{CHANNEL[r.channel]}
                  </p>
                </div>
                <p className="md-body-s text-on-surface-variant">{fmtDateTime(r.dueAt)}</p>
                <MdChip tone={s.tone}>{s.label}</MdChip>
                {(r.status === "scheduled" || r.status === "overdue") && (
                  <div className="flex gap-2">
                    <MdButton size="sm" variant="tonal" onClick={() => updateReminderStatus(r.id, "sent")}>
                      標記已發送
                    </MdButton>
                    <MdButton size="sm" variant="text" onClick={() => updateReminderStatus(r.id, "cancelled")}>
                      取消
                    </MdButton>
                  </div>
                )}
              </div>
            );
          })}
        </MdCard>
      )}
    </PageContainer>
  );
}
