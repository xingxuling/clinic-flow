import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CalendarSync,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, SectionHeader } from "@/components/m3";
import { summarizeConversationForFrontdesk } from "@/frontdesk/conversation-summary";
import { fmtTime, isSameDay } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import {
  arrivalActionLabel,
  bookingStatusFor,
  safetyBoundaryText,
  safetyFlagLabel,
} from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/today")({
  head: () => ({
    meta: [
      { title: "今日工作台｜Service Frontdesk" },
      { name: "description", content: "服務業 AI 前台的新對話、排程、改期、安全標記與待人工任務一覽。" },
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
    clinic,
    appointments,
    conversations,
    agentTasks,
    urgentFlags,
    patientName,
    serviceName,
    staffName,
    setAppointmentStatus,
    escalateUrgentFlag,
  } = useApp();
  const vertical = useTenantVertical(clinic);

  const now = new Date();
  const todayAppointments = appointments.filter((appointment) => isSameDay(appointment.startAt, now));
  const pending = todayAppointments.filter((appointment) => appointment.status === "pending");
  const unread = conversations.filter((conversation) => conversation.unread);
  const waitingReply = conversations.filter((conversation) => conversation.state === "waiting_human");
  const waitingApproval = agentTasks.filter((task) => task.status === "waiting_approval");
  const openFlags = urgentFlags.filter((flag) => !flag.handledAt);

  const frontdeskViews = conversations.map((conversation) => ({
    conversation,
    summary: summarizeConversationForFrontdesk({ clinic, conversation, vertical }),
  }));
  const rescheduleRequests = frontdeskViews.filter(
    (row) => row.summary.decision.appointmentIntent === "reschedule",
  );
  const faqReady = frontdeskViews.filter((row) => row.summary.decision.kind === "faq_reply");
  const bookingRequests = frontdeskViews.filter(
    (row) => row.summary.decision.kind === "appointment_request",
  );
  const handoffs = frontdeskViews.filter((row) => row.summary.decision.requiresHuman);
  const agentMessagesToday = conversations.reduce(
    (count, conversation) =>
      count +
      conversation.messages.filter(
        (message) => message.from === "agent" && isSameDay(message.at, now),
      ).length,
    0,
  );

  return (
    <PageContainer
      title="今日工作台"
      subtitle={`${vertical.displayName} · ${now.toLocaleDateString("zh-HK", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })}`}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <MdChip tone="secondary">{vertical.labels.customer}</MdChip>
        <MdChip tone="secondary">{vertical.labels.subject}</MdChip>
        <MdChip tone="secondary">{vertical.labels.resource}</MdChip>
        <MdChip tone="primary">{vertical.labels.booking}</MdChip>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          icon={<MessageCircle className="size-4" />}
          label="新對話"
          value={unread.length}
          to="/staff/inbox"
          tone="primary"
        />
        <MetricCard
          icon={<CheckCircle2 className="size-4" />}
          label={`待確認${vertical.labels.booking}`}
          value={pending.length}
          to="/staff/appointments"
          tone="tertiary"
        />
        <MetricCard
          icon={<CalendarSync className="size-4" />}
          label="要求改期"
          value={rescheduleRequests.length}
          to="/staff/inbox"
          tone="secondary"
        />
        <MetricCard
          icon={<AlertTriangle className="size-4" />}
          label={safetyFlagLabel(vertical)}
          value={openFlags.length}
          to="/staff/inbox"
          tone="error"
        />
        <MetricCard
          icon={<Bot className="size-4" />}
          label="待人工處理"
          value={waitingApproval.length + waitingReply.length}
          to="/staff/agent"
          tone="tertiary"
        />
      </div>

      <section className="mb-6">
        <SectionHeader title="AI 前台今日概況" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MdCard className="p-4">
            <p className="md-label-l text-on-surface-variant">可直接 FAQ 回覆</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{faqReady.length}</p>
            <p className="mt-1 md-body-s text-on-surface-variant">只使用商戶已授權行政答案</p>
          </MdCard>
          <MdCard className="p-4">
            <p className="md-label-l text-on-surface-variant">{vertical.labels.booking}意圖</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{bookingRequests.length}</p>
            <p className="mt-1 md-body-s text-on-surface-variant">確認／改期／取消／查詢新時段</p>
          </MdCard>
          <MdCard className="p-4">
            <p className="md-label-l text-on-surface-variant">需要人工接管</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{handoffs.length}</p>
            <p className="mt-1 md-body-s text-on-surface-variant">未命中流程、受限問題或高優先訊息</p>
          </MdCard>
          <MdCard className="p-4">
            <p className="md-label-l text-on-surface-variant">今日 Agent 訊息</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{agentMessagesToday}</p>
            <p className="mt-1 md-body-s text-on-surface-variant">通道 Adapter 可替換 WhatsApp / Web / 電話</p>
          </MdCard>
        </div>
      </section>

      {openFlags.length > 0 && (
        <section className="mb-6">
          <SectionHeader title={safetyFlagLabel(vertical)} count={openFlags.length} />
          <div className="grid gap-3 lg:grid-cols-2">
            {openFlags.map((flag) => (
              <MdCard key={flag.id} className="border border-error/40 bg-error-container/40 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
                  <div className="min-w-0 flex-1">
                    <p className="md-title-m text-on-surface">{patientName(flag.patientId)}</p>
                    <p className="mt-1 rounded-lg bg-surface-container-lowest p-3 md-body-m text-on-surface">
                      「{flag.quote}」
                    </p>
                    <p className="mt-2 md-body-s text-on-surface-variant">觸發原因：{flag.rule}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {flag.matchedKeywords.map((keyword) => (
                        <MdChip key={keyword} tone="error">{keyword}</MdChip>
                      ))}
                    </div>
                    <p className="mt-2 md-body-s text-on-surface-variant">{safetyBoundaryText(vertical)}</p>
                    <div className="mt-3 flex gap-2">
                      <MdButton size="sm" variant="danger" onClick={() => escalateUrgentFlag(flag.id)}>
                        立即轉人工
                      </MdButton>
                      <Link to="/staff/inbox" search={{ c: flag.conversationId }}>
                        <MdButton size="sm" variant="text">查看對話</MdButton>
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
          <SectionHeader title={`今日${vertical.labels.bookings}`} count={todayAppointments.length} />
          {todayAppointments.length === 0 ? (
            <EmptyState text={`今日暫時沒有${vertical.labels.booking}。`} />
          ) : (
            <MdCard className="divide-y divide-outline-variant overflow-hidden">
              {todayAppointments.map((appointment) => {
                const status = bookingStatusFor(vertical, appointment.status);
                return (
                  <div key={appointment.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="w-16 shrink-0">
                      <p className="md-title-m text-on-surface">{fmtTime(appointment.startAt)}</p>
                      <p className="md-body-s text-on-surface-variant">{fmtTime(appointment.endAt)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="md-title-m truncate text-on-surface">{patientName(appointment.patientId)}</p>
                      <p className="md-body-s truncate text-on-surface-variant">
                        {serviceName(appointment.serviceId)} · {staffName(appointment.practitionerId)} · {appointment.room}
                      </p>
                    </div>
                    <MdChip tone={status.tone}>{status.label}</MdChip>
                    {appointment.status === "pending" && (
                      <MdButton size="sm" variant="tonal" onClick={() => setAppointmentStatus(appointment.id, "confirmed")}>
                        確認
                      </MdButton>
                    )}
                    {appointment.status === "confirmed" && (
                      <MdButton size="sm" variant="outlined" onClick={() => setAppointmentStatus(appointment.id, "arrived")}>
                        {arrivalActionLabel(vertical)}
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
              action={<Link to="/staff/inbox" search={{ c: undefined }} className="md-label-l text-primary">全部</Link>}
            />
            {waitingReply.length === 0 ? (
              <EmptyState text="沒有待回覆訊息。" />
            ) : (
              <div className="space-y-2">
                {waitingReply.map((conversation) => {
                  const summary = summarizeConversationForFrontdesk({ clinic, conversation, vertical });
                  return (
                    <Link key={conversation.id} to="/staff/inbox" search={{ c: conversation.id }} className="block">
                      <MdCard className="state-layer p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="md-title-m truncate text-on-surface">{patientName(conversation.patientId)}</p>
                          {conversation.urgentFlagId && <MdChip tone="error">{safetyFlagLabel(vertical)}</MdChip>}
                        </div>
                        <p className="mt-1 md-label-l text-primary">{summary.title}</p>
                        <p className="mt-1 line-clamp-2 md-body-m text-on-surface-variant">{summary.nextAction}</p>
                      </MdCard>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <SectionHeader
              title="待人工批准的 Agent 任務"
              count={waitingApproval.length}
              action={<Link to="/staff/agent" className="md-label-l text-primary">全部</Link>}
            />
            {waitingApproval.length === 0 ? (
              <EmptyState text="沒有待批任務。" />
            ) : (
              <div className="space-y-2">
                {waitingApproval.map((task) => (
                  <Link key={task.id} to="/staff/agent" className="block">
                    <MdCard className="state-layer p-4">
                      <p className="md-title-m text-on-surface">{task.title}</p>
                      <p className="mt-1 md-body-s text-on-surface-variant">{task.intent}</p>
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
