import { createFileRoute } from "@tanstack/react-router";
import { Bot, Cpu, User, UserCircle } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdCard, MdChip, MdFilterChip, SectionHeader } from "@/components/m3";
import { fmtDateTime } from "@/lib/labels";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/staff/_app/audit")({
  head: () => ({
    meta: [
      { title: "審計日誌｜Service Frontdesk" },
      { name: "description", content: "記錄員工、客戶、系統與 Agent 在服務前台執行過的動作及結果。" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { auditEvents } = useApp();
  const [who, setWho] = useState<"all" | "staff" | "agent">("all");
  const list = auditEvents.filter((event) => who === "all" || event.actor.type === who);

  const icon = { staff: User, agent: Bot, system: Cpu, patient: UserCircle };

  return (
    <PageContainer title="審計日誌" subtitle="所有行政／服務流程與 Agent 決策皆留痕，包含被拒絕的操作。">
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "全部"],
            ["staff", "員工"],
            ["agent", "Agent"],
          ] as const
        ).map(([value, label]) => (
          <MdFilterChip key={value} selected={who === value} onClick={() => setWho(value)}>
            {label}
          </MdFilterChip>
        ))}
      </div>

      <SectionHeader title="事件" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text="沒有事件。" />
      ) : (
        <MdCard className="divide-y divide-outline-variant overflow-hidden">
          {list.map((event) => {
            const Icon = icon[event.actor.type];
            const tone = event.result === "success" ? "primary" : event.result === "blocked" ? "tertiary" : "error";
            return (
              <div key={event.id} className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="md-title-m text-on-surface">{event.action}</p>
                    <MdChip tone={tone}>{event.result === "success" ? "成功" : event.result === "blocked" ? "已阻止" : "失敗"}</MdChip>
                  </div>
                  <p className="mt-1 md-body-s text-on-surface-variant">
                    {event.actor.name} · {event.target} · {fmtDateTime(event.at)}
                  </p>
                  {event.detail && <p className="mt-1 md-body-m text-on-surface">{event.detail}</p>}
                </div>
              </div>
            );
          })}
        </MdCard>
      )}
    </PageContainer>
  );
}
