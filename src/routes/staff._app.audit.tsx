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
      { title: "審計日誌｜診所行政 Agent" },
      { name: "description", content: "記錄哪位員工或哪個 Agent、在何時、對什麼做了什麼、結果如何。" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { auditEvents } = useApp();
  const [who, setWho] = useState<"all" | "staff" | "agent">("all");
  const list = auditEvents.filter((e) => who === "all" || e.actor.type === who);

  const icon = { staff: User, agent: Bot, system: Cpu };

  return (
    <PageContainer title="審計日誌" subtitle="所有行政動作與 Agent 決策皆留痕，包含被拒絕的操作。">
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "全部"],
            ["staff", "員工"],
            ["agent", "Agent"],
          ] as const
        ).map(([v, l]) => (
          <MdFilterChip key={v} selected={who === v} onClick={() => setWho(v)}>
            {l}
          </MdFilterChip>
        ))}
      </div>

      <SectionHeader title="事件" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text="沒有事件。" />
      ) : (
        <MdCard className="divide-y divide-outline-variant overflow-hidden">
          {list.map((e) => {
            const Icon = icon[e.actor.type];
            const tone = e.result === "success" ? "primary" : e.result === "blocked" ? "tertiary" : "error";
            const label = { success: "成功", blocked: "已阻止", failed: "失敗" }[e.result];
            return (
              <div key={e.id} className="flex flex-wrap items-start gap-3 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="md-title-m text-on-surface">
                    {e.actor.name}・{e.action}
                  </p>
                  <p className="md-body-s text-on-surface-variant">
                    對象：{e.target}
                    {e.detail && `・${e.detail}`}
                  </p>
                </div>
                <p className="md-body-s text-on-surface-variant">{fmtDateTime(e.at)}</p>
                <MdChip tone={tone}>{label}</MdChip>
              </div>
            );
          })}
        </MdCard>
      )}
    </PageContainer>
  );
}
