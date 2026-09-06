import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  MessageSquareWarning,
} from "lucide-react";

import { PageContainer } from "@/components/layout/AppShell";
import { EmptyState, MdButton, MdCard, MdChip, SectionHeader } from "@/components/m3";
import { APPOINTMENT_STATUS, fmtTime, isSameDay } from "@/lib/labels";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/app/today")({
  head: () => ({
    meta: [
      { title: "今日工作台｜診所行政 Agent" },
      { name: "description", content: "今日預約、待確認、待回覆、緊急標記與待批 Agent 任務一覽。" },
    ],
  }),
  component: TodayPage,
});

function MetricCard({
  icon,
  label,
  value,
  to,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  to: string;
  tone: "primary" | "tertiary" | "error" | "secondary";
}) {
  const bg = {
    primary: "bg-primary-container text-on-primary-container",
    tertiary: "bg-tertiary-container text-on-tertiary-container",
    error: "bg-error-container text-on-error-container",
    secondary: "bg-secondary-container text-on-secondary-container",
  }[tone];
  return (
    <Link to={to} className="state-layer block rounded-2xl">
      <MdCard className={`h-full p-4 ${bg}`}>
        <div className="flex items-center gap-2 md-label-l">
          {icon}
          {label}
        </div>
        <p className="mt-3 text-3xl font-semibold leading-none">{value}</p>
      </MdCard>
    </Link>
  );
}

function TodayPage() {
  const {
    appointments,
    conversations,
    agentTasks,
    documents,
    urgentFlags,
    patientName,
    serviceName,
    staffName,
    setAppointmentStatus,
    escalateUrgentFlag,
  } = useApp();

  const now = new Date();
  const todayAppointments = appointments.filter((a) => isSameDay(a.startAt, now));
  const pending = todayAppointments.filter((a) => a.status === "pending");
  const waitingReply = conversations.filter((c) => c.state === "waiting_human");
  const waitingApproval = agentTasks.filter((t) => t.status === "waiting_approval");
  const docIssues = documents.filter((d) => d.status === "anomaly" || d.status === "needs_fields");
  const openFlags = urgentFlags.filter((f) => !f.handledAt);

  return (
    <PageContainer
      title="今日工作台"
      subtitle={now.toLocaleDateString("zh-HK", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })}
    >
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          icon={<CalendarClock className="size-4" />}
          label="今日預約"
          value={todayAppointments.length}
          to="/app/appointments"
          tone="primary"
        />
        <MetricCard
          icon={<CheckCircle2 className="size-4" />}
          label="待確認"
          value={pending.length}
          to="/app/appointments"
          tone="tertiary"
        />
        <MetricCard
          icon={<MessageSquareWarning className="size-4" />}
          label="待回覆"
          value={waitingReply.length}
          to="/app/inbox"
          tone="secondary"
        />
        <MetricCard
          icon={<Bot className="size-4" />}
          label="待人工批准"
          value={waitingApproval.length}
          to="/app/agent"
          tone="tertiary"
        />
        <MetricCard
          icon={<FileWarning className="size-4" />}
          label="文件異常"
          value={docIssues.length}
          to="/app/documents"
          tone="error"
        />
      </div>

      {openFlags.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="潛在緊急標記" count={openFlags.length} />
          <div className="grid gap-3 lg:grid-cols-2">
            {openFlags.map((f) => (
              <MdCard key={f.id} className="border border-error/40 bg-error-container/40 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
                  <div className="min-w-0 flex-1">
                    <p className="md-title-m text-on-surface">{patientName(f.patientId)}</p>
                    <p className="mt-1 rounded-lg bg-surface-container-lowest p-3 md-body-m text-on-surface">
                      「{f.quote}」
                    </p>
                    <p className="mt-2 md-body-s text-on-surface-variant">
                      觸發原因：{f.rule}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {f.matchedKeywords.map((k) => (
                        <MdChip key={k} tone="error">
                          {k}
                        </MdChip>
                      ))}
                    </div>
                    <p className="mt-2 md-body-s text-on-surface-variant">
                      系統只作關鍵詞標記，不提供任何醫學判斷或分流結論。
                    </p>
                    <div className="mt-3 flex gap-2">
                      <MdButton size="sm" variant="danger" onClick={() => escalateUrgentFlag(f.id)}>
                        立即轉人工
                      </MdButton>
                      <Link to="/app/inbox" search={{ c: f.conversationId }}>
                        <MdButton size="sm" variant="text">
                          查看對話
                        </MdButton>
                      </Link>
                    </div>
                  </div>
                </div>
              </MdCard>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <SectionHeader title="今日排程" count={todayAppointments.length} />
          {todayAppointments.length === 0 ? (
            <EmptyState text="今日暫時沒有預約。" />
          ) : (
            <MdCard className="divide-y divide-outline-variant overflow-hidden">
              {todayAppointments.map((a) => {
                const s = APPOINTMENT_STATUS[a.status];
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="w-16 shrink-0">
                      <p className="md-title-m text-on-surface">{fmtTime(a.startAt)}</p>
                      <p className="md-body-s text-on-surface-variant">{fmtTime(a.endAt)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="md-title-m truncate text-on-surface">{patientName(a.patientId)}</p>
                      <p className="md-body-s truncate text-on-surface-variant">
                        {serviceName(a.serviceId)}・{staffName(a.practitionerId)}・{a.room}
                      </p>
                    </div>
                    <MdChip tone={s.tone}>{s.label}</MdChip>
                    {a.status === "pending" && (
                      <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(a.id, "confirmed")}>
                        確認
                      </MdButton>
                    )}
                    {a.status === "confirmed" && (
                      <MdButton size="sm" variant="outlined" onClick={() => setAppointmentStatus(a.id, "arrived")}>
                        到診
                      </MdButton>
                    )}
                  </div>
                );
              })}
            </MdCard>
          )}
        </section>

        <section className="space-y-6">
          <div>
            <SectionHeader
              title="等待人手回覆"
              count={waitingReply.length}
              action={
                <Link to="/app/inbox" className="md-label-l text-primary">
                  全部
                </Link>
              }
            />
            {waitingReply.length === 0 ? (
              <EmptyState text="沒有待回覆訊息。" />
            ) : (
              <div className="space-y-2">
                {waitingReply.map((c) => (
                  <Link key={c.id} to="/app/inbox" search={{ c: c.id }} className="block">
                    <MdCard className="state-layer p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="md-title-m truncate text-on-surface">{patientName(c.patientId)}</p>
                        {c.urgentFlagId && <MdChip tone="error">緊急標記</MdChip>}
                      </div>
                      <p className="mt-1 line-clamp-2 md-body-m text-on-surface-variant">
                        {c.messages[c.messages.length - 1]?.text}
                      </p>
                    </MdCard>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeader
              title="待人工批准的 Agent 任務"
              count={waitingApproval.length}
              action={
                <Link to="/app/agent" className="md-label-l text-primary">
                  全部
                </Link>
              }
            />
            {waitingApproval.length === 0 ? (
              <EmptyState text="沒有待批任務。" />
            ) : (
              <div className="space-y-2">
                {waitingApproval.map((t) => (
                  <Link key={t.id} to="/app/agent" className="block">
                    <MdCard className="state-layer p-4">
                      <p className="md-title-m text-on-surface">{t.title}</p>
                      <p className="mt-1 md-body-s text-on-surface-variant">{t.intent}</p>
                    </MdCard>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
