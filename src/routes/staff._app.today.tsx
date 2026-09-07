import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CalendarSync,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";

import { useServiceBookings } from "@/bookings/use-service-bookings";
import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, SectionHeader } from "@/components/m3";
import { useServiceConversations } from "@/conversations/use-service-conversations";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { summarizeServiceConversationForFrontdesk } from "@/frontdesk/conversation-summary";
import { fmtTime, isSameDay } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import { filterByVertical } from "@/verticals/entity-scope";
import {
  arrivalActionLabel,
  bookingStatusFor,
  safetyBoundaryText,
  safetyFlagLabel,
} from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";
import { useServiceWorkItems } from "@/work-items/use-service-work-items";

export const Route = createFileRoute("/staff/_app/today")({
  head: () => ({
    meta: [
      { title: "今日｜Service Frontdesk" },
      { name: "description", content: "今日的新對話、排程、安全標記與待人工處理事項。" },
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
    patients,
    appointments,
    conversations: legacyConversations,
    agentTasks,
    urgentFlags,
    staffName,
    setAppointmentStatus,
    rescheduleAppointment,
    createAppointment,
  } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customerName } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const { bookings, setStatus } = useServiceBookings({
    clinic,
    vertical,
    legacyAppointments: appointments,
    legacyActions: {
      setStatus: setAppointmentStatus,
      reschedule: rescheduleAppointment,
      create: createAppointment,
    },
  });
  const serviceConversations = useServiceConversations({
    tenantId: clinic.id,
    vertical,
    legacyConversations,
  }).conversations;
  const workItems = useServiceWorkItems(clinic.id, vertical.id);
  const legacyTasks = filterByVertical(agentTasks, vertical.id);

  const serviceName = (serviceId: string) =>
    vertical.services.find((service) => service.id === serviceId)?.name ??
    clinic.services.find((service) => service.id === serviceId)?.name ??
    "服務";

  const now = new Date();
  const todayBookings = bookings.filter((booking) => isSameDay(booking.startAt, now));
  const pending = todayBookings.filter((booking) => booking.status === "pending");
  const unread = serviceConversations.filter((conversation) => conversation.unread);
  const waitingReply = serviceConversations.filter((conversation) => conversation.state === "waiting_human");
  const waitingLegacyApproval = legacyTasks.filter((task) => task.status === "waiting_approval");
  const waitingWorkItems = workItems.filter((item) => item.status === "waiting_approval");

  const frontdeskViews = serviceConversations.map((conversation) => ({
    conversation,
    summary: summarizeServiceConversationForFrontdesk({
      tenantId: clinic.id,
      conversation,
      vertical,
    }),
  }));
  const rescheduleRequests = frontdeskViews.filter(
    (row) => row.summary.decision.appointmentIntent === "reschedule",
  );
  const faqReady = frontdeskViews.filter((row) => row.summary.decision.kind === "faq_reply");
  const bookingRequests = frontdeskViews.filter((row) => row.summary.decision.kind === "appointment_request");
  const handoffs = frontdeskViews.filter((row) => row.summary.decision.requiresHuman);
  const agentMessagesToday = serviceConversations.reduce(
    (count, conversation) =>
      count +
      conversation.messages.filter(
        (message) => message.from === "agent" && isSameDay(message.at, now),
      ).length,
    0,
  );

  const safetyConversations = serviceConversations.filter((conversation) => {
    if (conversation.state !== "waiting_human") return false;
    if (conversation.safetySignal) return true;
    if (!conversation.legacyUrgentFlagId) return false;
    const flag = urgentFlags.find((item) => item.id === conversation.legacyUrgentFlagId);
    return Boolean(flag && !flag.handledAt);
  });

  const pendingHuman = waitingReply.length + waitingLegacyApproval.length + waitingWorkItems.length;

  return (
    <PageContainer
      title="今日"
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

      {vertical.id !== "dental" && bookings.length === 0 && serviceConversations.length === 0 && workItems.length === 0 && (
        <MdCard className="mb-5 border border-outline-variant bg-surface-container p-3">
          <p className="md-body-s text-on-surface-variant">
            此行業目前尚未建立排程、對話或待辦。可先到「客戶」匯入資料，再從「對話」開始服務流程。
          </p>
        </MdCard>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard icon={<MessageCircle className="size-4" />} label="新對話" value={unread.length} to="/staff/inbox" tone="primary" />
        <MetricCard icon={<CheckCircle2 className="size-4" />} label={`待確認${vertical.labels.booking}`} value={pending.length} to="/staff/bookings" tone="tertiary" />
        <MetricCard icon={<CalendarSync className="size-4" />} label="要求改期" value={rescheduleRequests.length} to="/staff/inbox" tone="secondary" />
        <MetricCard icon={<AlertTriangle className="size-4" />} label={safetyFlagLabel(vertical)} value={safetyConversations.length} to="/staff/inbox" tone="error" />
        <MetricCard icon={<Bot className="size-4" />} label="待人工處理" value={pendingHuman} to="/staff/agent" tone="tertiary" />
      </div>

      <section className="mb-6">
        <SectionHeader title="今日概況" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MdCard className="p-4">
            <p className="md-label-l text-on-surface-variant">可直接 FAQ 回覆</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{faqReady.length}</p>
            <p className="mt-1 md-body-s text-on-surface-variant">只使用商戶已授權的答案</p>
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
            <p className="mt-1 md-body-s text-on-surface-variant">只統計已實際送出並留下紀錄的 Agent 訊息</p>
          </MdCard>
        </div>
      </section>

      {safetyConversations.length > 0 && (
        <section className="mb-6">
          <SectionHeader title={safetyFlagLabel(vertical)} count={safetyConversations.length} />
          <div className="grid gap-3 lg:grid-cols-2">
            {safetyConversations.map((conversation) => {
              const legacyFlag = conversation.legacyUrgentFlagId
                ? urgentFlags.find((item) => item.id === conversation.legacyUrgentFlagId)
                : undefined;
              const quote = conversation.safetySignal?.quote ?? legacyFlag?.quote ?? "";
              const keywords = conversation.safetySignal?.matchedKeywords ?? legacyFlag?.matchedKeywords ?? [];
              return (
                <MdCard key={conversation.id} className="border border-error/40 bg-error-container/40 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
                    <div className="min-w-0 flex-1">
                      <p className="md-title-m text-on-surface">{customerName(conversation.customerId)}</p>
                      <p className="mt-1 rounded-lg bg-surface-container-lowest p-3 md-body-m text-on-surface">「{quote}」</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {keywords.map((keyword) => <MdChip key={keyword} tone="error">{keyword}</MdChip>)}
                      </div>
                      <p className="mt-2 md-body-s text-on-surface-variant">{safetyBoundaryText(vertical)}</p>
                      <div className="mt-3 flex gap-2">
                        <Link to="/staff/inbox" search={{ c: conversation.id }}>
                          <MdButton size="sm" variant="danger">立即查看並接管</MdButton>
                        </Link>
                      </div>
                    </div>
                  </div>
                </MdCard>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <SectionHeader title={`今日${vertical.labels.bookings}`} count={todayBookings.length} />
          {todayBookings.length === 0 ? (
            <EmptyState text={`今日暫時沒有${vertical.labels.booking}。`} />
          ) : (
            <MdCard className="divide-y divide-outline-variant overflow-hidden">
              {todayBookings.map((booking) => {
                const status = bookingStatusFor(vertical, booking.status);
                return (
                  <div key={booking.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="w-16 shrink-0">
                      <p className="md-title-m text-on-surface">{fmtTime(booking.startAt)}</p>
                      <p className="md-body-s text-on-surface-variant">{fmtTime(booking.endAt)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="md-title-m truncate text-on-surface">{customerName(booking.customerId)}</p>
                      <p className="md-body-s truncate text-on-surface-variant">
                        {serviceName(booking.serviceId)} · {staffName(booking.resourceId)} · {booking.venue}
                      </p>
                    </div>
                    <MdChip tone={status.tone}>{status.label}</MdChip>
                    {booking.status === "pending" && (
                      <MdButton size="sm" variant="tonal" onClick={() => setStatus(booking.id, "confirmed")}>確認</MdButton>
                    )}
                    {booking.status === "confirmed" && (
                      <MdButton size="sm" variant="outlined" onClick={() => setStatus(booking.id, "arrived")}>
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
            <SectionHeader title="等待人手回覆" count={waitingReply.length} action={<Link to="/staff/inbox" search={{ c: undefined }} className="md-label-l text-primary">全部</Link>} />
            {waitingReply.length === 0 ? (
              <EmptyState text="沒有待回覆訊息。" />
            ) : (
              <div className="space-y-2">
                {waitingReply.map((conversation) => {
                  const summary = summarizeServiceConversationForFrontdesk({
                    tenantId: clinic.id,
                    conversation,
                    vertical,
                  });
                  return (
                    <Link key={conversation.id} to="/staff/inbox" search={{ c: conversation.id }} className="block">
                      <MdCard className="state-layer p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="md-title-m truncate text-on-surface">{customerName(conversation.customerId)}</p>
                          {(conversation.safetySignal || conversation.legacyUrgentFlagId) && <MdChip tone="error">{safetyFlagLabel(vertical)}</MdChip>}
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
              title="待人工批准"
              count={waitingLegacyApproval.length + waitingWorkItems.length}
              action={<Link to="/staff/agent" className="md-label-l text-primary">全部</Link>}
            />
            {waitingLegacyApproval.length + waitingWorkItems.length === 0 ? (
              <EmptyState text="沒有待批事項。" />
            ) : (
              <div className="space-y-2">
                {waitingWorkItems.slice(0, 3).map((item) => (
                  <Link key={item.id} to="/staff/agent" className="block">
                    <MdCard className="state-layer p-4">
                      <p className="md-title-m text-on-surface">{item.title}</p>
                      <p className="mt-1 md-body-s text-on-surface-variant">{item.intent}</p>
                    </MdCard>
                  </Link>
                ))}
                {waitingLegacyApproval.slice(0, Math.max(0, 3 - waitingWorkItems.length)).map((task) => (
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
