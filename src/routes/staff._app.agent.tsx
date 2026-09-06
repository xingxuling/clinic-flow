import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, PencilRuler, ShieldAlert, Target } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip, SectionHeader } from "@/components/m3";
import { AGENT_STATUS, RISK, fmtDateTime } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { AgentTaskStatus } from "@/types/domain";

export const Route = createFileRoute("/staff/_app/agent")({
  head: () => ({
    meta: [
      { title: "Agent 任務台｜診所行政 Agent" },
      { name: "description", content: "查看 Agent 準備做什麼、依據什麼、會修改什麼；高風險動作必須人工批准。" },
    ],
  }),
  component: AgentPage,
});

const FILTERS: { value: AgentTaskStatus | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "waiting_approval", label: "等待批准" },
  { value: "auto_running", label: "自動執行中" },
  { value: "failed", label: "失敗" },
  { value: "done", label: "已完成" },
];

function AgentPage() {
  const { agentTasks, patientName, decideAgentTask, retryAgentTask, staffName } = useApp();
  const [filter, setFilter] = useState<AgentTaskStatus | "all">("all");

  const list = agentTasks.filter((t) => filter === "all" || t.status === filter);

  return (
    <PageContainer
      title="Agent 任務台"
      subtitle="每項任務都會顯示準備做什麼、依據什麼、會修改什麼。高風險動作一律等待人工批准。"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <MdFilterChip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </MdFilterChip>
        ))}
      </div>

      <SectionHeader title="任務" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text="沒有符合條件的任務。" />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {list.map((t) => {
            const status = AGENT_STATUS[t.status];
            const risk = RISK[t.risk];
            return (
              <MdCard key={t.id} className="p-5">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                    <Bot className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="md-title-m text-on-surface">{t.title}</p>
                    <p className="md-body-s text-on-surface-variant">
                      建立於 {fmtDateTime(t.createdAt)}
                      {t.relatedPatientId && `・${patientName(t.relatedPatientId)}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MdChip tone={status.tone}>{status.label}</MdChip>
                    <MdChip tone={risk.tone}>{risk.label}</MdChip>
                  </div>
                </div>

                <dl className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <Target className="mt-0.5 size-4 shrink-0 text-on-surface-variant" />
                    <div>
                      <dt className="md-label-m text-on-surface-variant">準備做什麼</dt>
                      <dd className="md-body-m text-on-surface">{t.intent}</dd>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Database className="mt-0.5 size-4 shrink-0 text-on-surface-variant" />
                    <div>
                      <dt className="md-label-m text-on-surface-variant">依據什麼</dt>
                      <dd className="md-body-m text-on-surface">
                        <ul className="list-disc pl-4">
                          {t.basis.map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <PencilRuler className="mt-0.5 size-4 shrink-0 text-on-surface-variant" />
                    <div>
                      <dt className="md-label-m text-on-surface-variant">會修改什麼</dt>
                      <dd className="md-body-m text-on-surface">
                        <ul className="list-disc pl-4">
                          {t.effects.map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  </div>
                </dl>

                {t.failureReason && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-error-container p-3 md-body-s text-on-error-container">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    失敗原因：{t.failureReason}
                  </p>
                )}

                {t.decidedAt && (
                  <p className="mt-3 md-body-s text-on-surface-variant">
                    由 {t.decidedBy ? staffName(t.decidedBy) : "系統"} 於 {fmtDateTime(t.decidedAt)} 處理
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {t.status === "waiting_approval" && (
                    <>
                      <MdButton size="sm" onClick={() => decideAgentTask(t.id, true)}>
                        批准執行
                      </MdButton>
                      <MdButton size="sm" variant="outlined" onClick={() => decideAgentTask(t.id, false)}>
                        否決
                      </MdButton>
                    </>
                  )}
                  {t.status === "failed" && (
                    <MdButton size="sm" variant="tonal" onClick={() => retryAgentTask(t.id)}>
                      轉為待批重試
                    </MdButton>
                  )}
                  {t.status === "auto_running" && (
                    <MdChip tone="primary">低風險任務，按規則自動執行</MdChip>
                  )}
                </div>
              </MdCard>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
