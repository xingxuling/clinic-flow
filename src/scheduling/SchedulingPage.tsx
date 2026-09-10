import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, MapPin, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageContainer } from "@/components/layout/StaffShell";
import {
  EmptyState,
  MdButton,
  MdCard,
  MdChip,
  MdSelect,
  MdTextField,
  SectionHeader,
} from "@/components/m3";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { useApp } from "@/state/app-store";
import { durationPoliciesForVertical, ensureDemoWorkers } from "@/scheduling/demo";
import { serviceSchedulingRuntime } from "@/scheduling/runtime";
import { schedulingRepository } from "@/scheduling/repository";
import { useSchedulingSnapshot } from "@/scheduling/use-scheduling";
import type { SchedulingCandidate, ServiceRequestUrgency } from "@/scheduling/types";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/bookings")({
  head: () => ({
    meta: [
      { title: "智能排程｜Service Frontdesk" },
      { name: "description", content: "Customer Request、Worker 匹配、五分钟 Hold 与确认锁定。" },
    ],
  }),
  component: SchedulingPage,
});

type RequestForm = {
  customerId: string;
  serviceType: string;
  area: string;
  date: string;
  time: string;
  urgency: ServiceRequestUrgency;
  requirements: string;
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  MATCHING: "匹配中",
  OFFERED: "待选择",
  HELD: "暂时锁定",
  CUSTOMER_CONFIRMED: "客户已确认",
  WORKER_NOTIFIED: "已通知师傅",
  SCHEDULED: "已排程",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  EXPIRED: "已过期",
  CANCELLED: "已取消",
  DECLINED: "已拒绝",
  RESCHEDULE_REQUIRED: "需要改期",
  FAILED: "处理失败",
};

function nextDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCandidate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatTimeRange(start: string, end: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("zh-HK", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${formatter.format(new Date(start))}–${formatter.format(new Date(end))}`;
}

function scorePercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function statusTone(status: string): "primary" | "secondary" | "tertiary" | "error" | "neutral" {
  if (status === "SCHEDULED" || status === "CUSTOMER_CONFIRMED") return "primary";
  if (status === "HELD" || status === "OFFERED") return "tertiary";
  if (status === "FAILED" || status === "EXPIRED") return "error";
  return "neutral";
}

function CandidateCard({
  candidate,
  timezone,
  holdDurationMin,
  onHold,
  disabled,
}: {
  candidate: SchedulingCandidate;
  timezone: string;
  holdDurationMin: number;
  onHold: (candidate: SchedulingCandidate) => void;
  disabled: boolean;
}) {
  return (
    <MdCard variant="outlined" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="md-title-m text-on-surface">{candidate.workerName}</p>
              <MdChip tone={candidate.tier === "best" ? "primary" : "neutral"}>
                {candidate.tier === "best"
                  ? "最佳候选"
                  : candidate.tier === "alternative"
                    ? "替代时段"
                    : "备用"}
              </MdChip>
            </div>
            <p className="mt-1 md-body-m text-on-surface-variant">
              {formatCandidate(candidate.serviceStartAt, timezone)} ·{" "}
              {formatTimeRange(candidate.serviceStartAt, candidate.serviceEndAt, timezone)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="md-label-l text-primary">{scorePercent(candidate.score)}</p>
          <p className="md-body-s text-on-surface-variant">匹配分数</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {candidate.reasons.map((reason) => (
          <MdChip key={`${candidate.candidateId}-${reason}`} tone="secondary">
            {reason}
          </MdChip>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="md-body-s text-on-surface-variant">
          Worker 锁定窗口：
          {formatTimeRange(candidate.reservedStartAt, candidate.reservedEndAt, timezone)}
        </p>
        <MdButton size="sm" variant="tonal" onClick={() => onHold(candidate)} disabled={disabled}>
          暂时锁定 {holdDurationMin} 分钟
        </MdButton>
      </div>
    </MdCard>
  );
}

export function SchedulingPage() {
  const { clinic, patients, staff } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customers } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const snapshot = useSchedulingSnapshot(clinic.id, vertical.id);
  const durationPolicies = useMemo(() => durationPoliciesForVertical(vertical), [vertical]);
  const holdDurationMin = vertical.scheduling?.holdDurationMin ?? 5;
  const [form, setForm] = useState<RequestForm>({
    customerId: "",
    serviceType: vertical.services[0]?.id ?? "",
    area: clinic.district,
    date: nextDate(),
    time: "10:00",
    urgency: "normal",
    requirements: "",
  });
  const [requestId, setRequestId] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<ReturnType<
    typeof serviceSchedulingRuntime.findMatches
  > | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [lastConfirmation, setLastConfirmation] = useState<ReturnType<
    typeof serviceSchedulingRuntime.confirmHold
  > | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    schedulingRepository.refresh();
    const seeded = staff.length > 0 ? schedulingRepository.listWorkers(clinic.id, vertical.id) : [];
    if (seeded.length === 0) {
      ensureDemoWorkers({
        repository: schedulingRepository,
        tenantId: clinic.id,
        vertical,
        staff,
        timezone: clinic.timezone,
      });
    }
  }, [clinic.id, clinic.timezone, staff, vertical]);

  useEffect(() => {
    if (!form.customerId && customers[0]) {
      setForm((current) => ({ ...current, customerId: customers[0]!.id }));
    }
  }, [customers, form.customerId]);

  useEffect(() => {
    if (form.serviceType && vertical.services.some((service) => service.id === form.serviceType))
      return;
    setForm((current) => ({ ...current, serviceType: vertical.services[0]?.id ?? "" }));
  }, [form.serviceType, vertical.services]);

  const activeRequest = requestId
    ? (snapshot.requests.find((request) => request.requestId === requestId) ?? null)
    : null;
  const activeHold = holdId
    ? (snapshot.holds.find((hold) => hold.holdId === holdId) ?? null)
    : null;
  const customerName = (customerId: string) =>
    customers.find((customer) => customer.id === customerId)?.displayName ?? `客戶 ${customerId}`;
  const serviceName = (serviceType: string) =>
    vertical.services.find((service) => service.id === serviceType)?.name ?? serviceType;

  const setField = <K extends keyof RequestForm>(key: K, value: RequestForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const search = () => {
    if (!form.customerId) {
      toast.error("请先选择客户");
      return;
    }
    if (!form.serviceType || !form.date || !form.time) {
      toast.error("请完成服务、日期和时间");
      return;
    }
    setBusy(true);
    try {
      const request = serviceSchedulingRuntime.createRequest({
        tenantId: clinic.id,
        verticalId: vertical.id,
        customerId: form.customerId,
        serviceType: form.serviceType,
        approximateArea: {
          areaId:
            form.area.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, "-") || "unspecified",
          label: form.area.trim() || clinic.district,
        },
        requestedDate: form.date,
        requestedTime: form.time,
        urgency: form.urgency,
        requirements: form.requirements
          .split(/[，,\n]/u)
          .map((item) => item.trim())
          .filter(Boolean),
      });
      const result = serviceSchedulingRuntime.findMatches({
        tenantId: clinic.id,
        verticalId: vertical.id,
        requestId: request.requestId,
        durationPolicies,
        timezone: clinic.timezone,
      });
      setRequestId(request.requestId);
      setHoldId(null);
      setLastConfirmation(null);
      setMatchResult(result);
      if (result.candidates.length === 0) {
        toast.error("目前没有符合条件的候选", {
          description: "可调整日期、时间或服务区后再查询。",
        });
      } else {
        toast.success(`找到 ${result.candidates.length} 个候选时段`);
      }
    } catch (error) {
      toast.error("排程查询失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const holdCandidate = (candidate: SchedulingCandidate) => {
    if (!requestId || activeHold) return;
    const receipt = serviceSchedulingRuntime.holdCandidate({
      tenantId: clinic.id,
      verticalId: vertical.id,
      requestId,
      candidateId: candidate.candidateId,
      durationPolicies,
      timezone: clinic.timezone,
      holdDurationMin,
      idempotencyKey: `ui-hold:${requestId}:${candidate.candidateId}`,
    });
    if (!receipt.ok || !receipt.hold) {
      toast.error("暂时锁定失败", { description: receipt.code });
      return;
    }
    setHoldId(receipt.hold.holdId);
    toast.success(`已暂时锁定 ${holdDurationMin} 分钟`, {
      description: "客户确认后才会建立正式排程。",
    });
  };

  const confirmHold = () => {
    if (!activeHold) return;
    const receipt = serviceSchedulingRuntime.confirmHold({
      tenantId: clinic.id,
      verticalId: vertical.id,
      holdId: activeHold.holdId,
      idempotencyKey: `ui-confirm:${activeHold.holdId}`,
    });
    setLastConfirmation(receipt);
    if (!receipt.ok) {
      toast.error("确认没有完成", { description: receipt.errors[0] ?? receipt.code });
      return;
    }
    toast.success("已建立正式排程", {
      description: "Worker 通知和客户通知已进入统一 Channel 队列。",
    });
  };

  const recentRequests = snapshot.requests.slice(0, 5);
  const currentBookings = snapshot.bookings.slice(0, 5);

  return (
    <PageContainer
      title="智能排程"
      subtitle={`${vertical.displayName} · Customer Request → Worker 匹配 → Hold → Confirm`}
      actions={
        <Link to="/staff/workers">
          <MdButton size="sm" variant="outlined" icon={<UserRound className="size-4" />}>
            管理 Worker
          </MdButton>
        </Link>
      }
    >
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <MdCard className="p-4">
          <div className="flex items-center gap-2 md-label-l text-primary">
            <Sparkles className="size-4" />
            智能匹配
          </div>
          <p className="mt-2 md-body-s text-on-surface-variant">
            先做租户、能力、服务区、档期和 buffer 硬过滤，再按可解释因素排序。
          </p>
        </MdCard>
        <MdCard className="p-4">
          <div className="flex items-center gap-2 md-label-l text-tertiary">
            <Clock3 className="size-4" />
            五分钟 Hold
          </div>
          <p className="mt-2 md-body-s text-on-surface-variant">
            Hold 不等于正式预约；过期会自动释放，不占用长期排程。
          </p>
        </MdCard>
        <MdCard className="p-4">
          <div className="flex items-center gap-2 md-label-l text-secondary-foreground">
            <ShieldCheck className="size-4" />
            隐私中介
          </div>
          <p className="mt-2 md-body-s text-on-surface-variant">
            Customer 与 Worker 只看 Job alias 和模糊区域，不交换私人电话。
          </p>
        </MdCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.85fr)_minmax(480px,1.15fr)]">
        <MdCard className="p-5">
          <SectionHeader title="1 · 建立 Customer Request" />
          {customers.length === 0 ? (
            <EmptyState text="目前没有客户资料。请先到「客户」建立一位客户，再开始排程。" />
          ) : (
            <div className="grid gap-4">
              <MdSelect
                label="客户"
                value={form.customerId}
                onChange={(event) => setField("customerId", event.target.value)}
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.displayName}
                  </option>
                ))}
              </MdSelect>
              <MdSelect
                label="服务项目"
                value={form.serviceType}
                onChange={(event) => setField("serviceType", event.target.value)}
              >
                {vertical.services.length === 0 && <option value="">此行业暂无服务目录</option>}
                {vertical.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </MdSelect>
              <MdTextField
                label="模糊服务区／邮区"
                value={form.area}
                onChange={(event) => setField("area", event.target.value)}
                placeholder="例如：观塘"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <MdTextField
                  label="请求日期"
                  type="date"
                  value={form.date}
                  onChange={(event) => setField("date", event.target.value)}
                />
                <MdTextField
                  label="首选开始时间"
                  type="time"
                  value={form.time}
                  onChange={(event) => setField("time", event.target.value)}
                />
              </div>
              <MdSelect
                label="紧急程度"
                value={form.urgency}
                onChange={(event) =>
                  setField("urgency", event.target.value as ServiceRequestUrgency)
                }
              >
                <option value="flexible">时间弹性</option>
                <option value="normal">一般</option>
                <option value="urgent">尽快安排</option>
                <option value="emergency">紧急（仍须按 Worker 能力与人工规则）</option>
              </MdSelect>
              <MdTextField
                label="要求／限制（可选，以逗号分隔）"
                value={form.requirements}
                onChange={(event) => setField("requirements", event.target.value)}
                placeholder="例如：需要停车位、携带工具"
              />
              <MdButton onClick={search} disabled={busy || !form.serviceType}>
                {busy ? "查询中…" : "查询可用 Worker 与时段"}
              </MdButton>
            </div>
          )}
          <div className="mt-5 rounded-2xl bg-surface-container p-3">
            <p className="md-label-l text-on-surface">隐私提示</p>
            <p className="mt-1 md-body-s text-on-surface-variant">
              匹配只使用 Customer Request
              中的服务、模糊区域、时间和约束；完整地址、门禁与电话号码不会进入候选排序。
            </p>
          </div>
        </MdCard>

        <div className="space-y-5">
          <MdCard className="p-5">
            <SectionHeader
              title="2 · 候选 Worker 与时段"
              count={matchResult?.candidates.length ?? 0}
            />
            {!matchResult && (
              <EmptyState text="提交 Customer Request 后，这里会显示按硬约束过滤和排序的候选。" />
            )}
            {matchResult && matchResult.candidates.length === 0 && (
              <div className="rounded-2xl bg-error-container/50 p-4 md-body-m text-on-error-container">
                没有候选。已排除 {matchResult.excluded.length} 位
                Worker；可调整日期、时间、服务区或服务项目。
              </div>
            )}
            {matchResult && matchResult.candidates.length > 0 && (
              <div className="space-y-3">
                {matchResult.candidates.slice(0, 6).map((candidate) => (
                  <CandidateCard
                    key={candidate.candidateId}
                    candidate={candidate}
                    timezone={clinic.timezone}
                    holdDurationMin={holdDurationMin}
                    onHold={holdCandidate}
                    disabled={Boolean(activeHold)}
                  />
                ))}
              </div>
            )}
          </MdCard>

          {activeHold && (
            <MdCard variant="elevated" className="border border-tertiary p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tertiary-container text-on-tertiary-container">
                  <Clock3 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="md-title-m text-on-surface">暂时锁定中的时段</p>
                    <MdChip tone="tertiary">{activeHold.status}</MdChip>
                  </div>
                  <p className="mt-1 md-body-m text-on-surface-variant">
                    {customerName(activeHold.customerId)} ·{" "}
                    {formatTimeRange(
                      activeHold.serviceStartAt,
                      activeHold.serviceEndAt,
                      clinic.timezone,
                    )}
                  </p>
                  <p className="mt-1 md-body-s text-on-surface-variant">
                    保留至 {formatCandidate(activeHold.expiresAt, clinic.timezone)}
                    。确认前不会把它当作正式预约。
                  </p>
                  <MdButton
                    className="mt-4"
                    onClick={confirmHold}
                    disabled={activeHold.status !== "ACTIVE"}
                    icon={<CheckCircle2 className="size-4" />}
                  >
                    客户确认并建立排程
                  </MdButton>
                </div>
              </div>
            </MdCard>
          )}

          {lastConfirmation && (
            <MdCard className="border border-primary bg-primary-container/30 p-5">
              <p className="md-title-m text-on-surface">
                {lastConfirmation.ok ? "排程已建立" : "排程确认失败"}
              </p>
              <p className="mt-1 md-body-m text-on-surface-variant">
                {lastConfirmation.ok
                  ? "通知已进入统一 Channel 队列，双方仍通过 Job alias 沟通。"
                  : lastConfirmation.errors.join("、")}
              </p>
              {lastConfirmation.privacyContext && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MdChip tone="secondary">
                    {lastConfirmation.privacyContext.customerIdentity.alias}
                  </MdChip>
                  <MdChip tone="secondary">
                    {lastConfirmation.privacyContext.workerIdentity.alias}
                  </MdChip>
                </div>
              )}
              {lastConfirmation.workItemId && (
                <div className="mt-3">
                  <MdChip tone="tertiary">通知 Work Item 已建立，等待统一通道处理</MdChip>
                </div>
              )}
              {lastConfirmation.conversation && (
                <p className="mt-3 md-body-s text-on-surface-variant">
                  Job Conversation：Customer Agent ↔ Worker Agent ·{" "}
                  {lastConfirmation.conversation.state}
                </p>
              )}
            </MdCard>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <MdCard className="p-5">
          <SectionHeader title="最近的 Customer Request" count={recentRequests.length} />
          {recentRequests.length === 0 ? (
            <EmptyState text="尚未建立请求。" />
          ) : (
            <div className="space-y-2">
              {recentRequests.map((request) => (
                <div
                  key={request.requestId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-container p-3"
                >
                  <div className="min-w-0">
                    <p className="md-label-l truncate text-on-surface">
                      {customerName(request.customerId)} · {serviceName(request.serviceType)}
                    </p>
                    <p className="md-body-s truncate text-on-surface-variant">
                      {request.approximateArea?.label ?? "未提供区域"} ·{" "}
                      {request.requestedDate ?? "弹性日期"}
                    </p>
                  </div>
                  <MdChip tone={statusTone(request.status)}>
                    {REQUEST_STATUS_LABELS[request.status] ?? request.status}
                  </MdChip>
                </div>
              ))}
            </div>
          )}
        </MdCard>
        <MdCard className="p-5">
          <SectionHeader title="已建立的正式排程" count={currentBookings.length} />
          {currentBookings.length === 0 ? (
            <EmptyState text="确认后的 Booking 会显示在这里。" />
          ) : (
            <div className="space-y-2">
              {currentBookings.map((booking) => (
                <div
                  key={booking.bookingId}
                  className="flex items-center gap-3 rounded-xl bg-surface-container p-3"
                >
                  <MapPin className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="md-label-l truncate text-on-surface">
                      {customerName(booking.customerId)} · Worker{" "}
                      {booking.workerId.replace(/^worker_/u, "")}
                    </p>
                    <p className="md-body-s truncate text-on-surface-variant">
                      {formatCandidate(booking.serviceStartAt, clinic.timezone)} · buffer
                      已纳入锁定窗口
                    </p>
                  </div>
                  <MdChip tone={statusTone(booking.status)}>{booking.status}</MdChip>
                </div>
              ))}
            </div>
          )}
        </MdCard>
      </div>

      {activeRequest && (
        <p className="mt-4 md-body-s text-on-surface-variant">
          当前 Request：{activeRequest.requestId} · 状态{" "}
          {REQUEST_STATUS_LABELS[activeRequest.status] ?? activeRequest.status}
        </p>
      )}
    </PageContainer>
  );
}
