import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  JobAgentCommunicationRuntime,
  type JobAgentSide,
  type JobAgentMessageResult,
} from "@/conversations/job-intent";
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
import { PrivacyBroker } from "@/privacy/broker";
import { browserSchedulingRepository } from "@/scheduling/repository";
import { demoAreaFor, demoWorkersFor } from "@/scheduling/demo";
import { smartSchedulingRuntime, type CreateServiceRequestInput } from "@/scheduling/runtime";
import type { MatchingResult, ScheduleHold, ServiceRequest, Worker } from "@/scheduling/types";
import { useApp } from "@/state/app-store";
import { cn } from "@/lib/utils";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";
import { JourneyLaunch } from "@/components/scheduling/JourneyLaunch";

const REASON_LABELS: Record<string, string> = {
  available: "档期可用",
  serves_area: "覆盖此地区",
  capability_match: "服务能力匹配",
  exact_time_match: "完全符合所选时间",
  closest_time: "接近所选时间",
  low_travel_cost: "移动缓冲较低",
  schedule_efficiency: "排程衔接较好",
  urgency_compatible: "与紧急程度相容",
  customer_preference: "符合客户偏好",
};

const EXCLUSION_LABELS: Record<string, string> = {
  worker_inactive: "人员目前不可用",
  capability_mismatch: "服务能力不匹配",
  duration_out_of_bounds: "时长超出能力范围",
  area_not_served: "不覆盖此地区",
  outside_availability: "超出可工作时段",
  availability_exception: "遇到临时不可用时段",
  booking_conflict: "与既有预约冲突",
  hold_conflict: "与其他临时保留冲突",
};

function localDateInput(offsetDays = 1): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: string, timeZone: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-HK", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}

function formatDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-HK", {
        timeZone,
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}

function statusLabel(state: string): string {
  const labels: Record<string, string> = {
    CUSTOMER_CONFIRMED: "客户已确认",
    WORKER_NOTIFIED: "Worker 已通知",
    SCHEDULED: "已排程",
  };
  return labels[state] ?? state;
}

function dayLabel(weekday: number): string {
  return ["日", "一", "二", "三", "四", "五", "六"][weekday] ?? String(weekday);
}

export function SmartSchedulingPage() {
  const { clinic, patients, currentStaff } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customers } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const area = useMemo(() => demoAreaFor(clinic.id, clinic.district), [clinic.id, clinic.district]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [, setBookingsVersion] = useState(0);
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [matching, setMatching] = useState<MatchingResult | null>(null);
  const [hold, setHold] = useState<ScheduleHold | null>(null);
  const [confirmation, setConfirmation] = useState<Awaited<
    ReturnType<typeof smartSchedulingRuntime.confirmHold>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState("");
  const [agentSide, setAgentSide] = useState<JobAgentSide>("customer");
  const [agentText, setAgentText] = useState("");
  const [agentResult, setAgentResult] = useState<JobAgentMessageResult | null>(null);

  const communication = useMemo(
    () =>
      new JobAgentCommunicationRuntime(
        browserSchedulingRepository,
        new PrivacyBroker(browserSchedulingRepository),
      ),
    [],
  );

  const selectedCustomer =
    customers.find((customer) => customer.id === activeRequest?.customerId) ?? customers[0];
  const bookings = browserSchedulingRepository.listBookings(clinic.id, vertical.id);

  useEffect(() => {
    const existing = browserSchedulingRepository.listWorkers(clinic.id, vertical.id);
    if (existing.length > 0) {
      setWorkers(existing);
    } else {
      const seeded = demoWorkersFor(clinic.id, vertical, area);
      seeded.forEach((worker) => browserSchedulingRepository.saveWorker(worker));
      setWorkers(seeded);
    }
    setActiveRequest(null);
    setMatching(null);
    setHold(null);
    setConfirmation(null);
    setAgentResult(null);
  }, [area, clinic.id, vertical]);

  const serviceLabel = (serviceId: string) =>
    vertical.services.find((service) => service.id === serviceId)?.name ?? serviceId;

  const submitRequest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomer) {
      toast.error("请先建立客户资料");
      return;
    }
    const form = new FormData(event.currentTarget);
    const estimatedDuration = String(form.get("estimatedDurationMin") ?? "").trim();
    const requirements = String(form.get("requirements") ?? "")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    const urgency = String(form.get("urgency") ?? "normal") as NonNullable<
      CreateServiceRequestInput["urgency"]
    >;
    const input: CreateServiceRequestInput = {
      tenantId: clinic.id,
      verticalId: vertical.id,
      customerId: String(form.get("customerId")),
      serviceType: String(form.get("serviceType")),
      approximateArea: area,
      timeZone: clinic.timezone,
      requestedDate: String(form.get("requestedDate")),
      requestedTime: String(form.get("requestedTime")),
      urgency,
      requirements,
      ...(estimatedDuration ? { estimatedDurationMin: Number(estimatedDuration) } : {}),
      idempotencyKey: `ui:${clinic.id}:${Date.now()}`,
    };
    try {
      const request = smartSchedulingRuntime.createRequest(input);
      const result = smartSchedulingRuntime.findCandidates(
        clinic.id,
        vertical.id,
        request.requestId,
      );
      setActiveRequest(request);
      setMatching(result);
      setHold(null);
      setConfirmation(null);
      setAgentResult(null);
      if (result?.candidates.length) toast.success(`找到 ${result.candidates.length} 个可选时段`);
      else
        toast.warning("暂时没有完全符合的时段", {
          description: "可以调整时间、服务地区或时长后再试。",
        });
    } catch (error) {
      toast.error("无法建立服务请求", {
        description: error instanceof Error ? error.message : "请检查输入",
      });
    }
  };

  const holdCandidate = async (candidateId: string) => {
    if (!activeRequest) return;
    setBusy(true);
    try {
      const result = await smartSchedulingRuntime.holdCandidate({
        tenantId: clinic.id,
        verticalId: vertical.id,
        requestId: activeRequest.requestId,
        candidateId,
        idempotencyKey: `ui-hold:${activeRequest.requestId}:${candidateId}`,
      });
      if (result.ok && result.hold) {
        setHold(result.hold);
        toast.success("时段已临时保留 5 分钟");
      } else {
        toast.error("时段已被其他排程占用", { description: result.code });
        setMatching(
          smartSchedulingRuntime.findCandidates(clinic.id, vertical.id, activeRequest.requestId),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmHold = async () => {
    if (!hold || !activeRequest || !selectedCustomer) return;
    setBusy(true);
    try {
      const result = await smartSchedulingRuntime.confirmHold({
        tenantId: clinic.id,
        verticalId: vertical.id,
        holdId: hold.holdId,
        customerId: activeRequest.customerId,
        idempotencyKey: `ui-booking:${hold.holdId}`,
        customerDisplayName: selectedCustomer.displayName,
        ...(address.trim() ? { areaDetail: address.trim() } : {}),
      });
      if (result.ok) {
        setConfirmation(result);
        setBookingsVersion((version) => version + 1);
        toast.success("服务已确认，Job 与隐私上下文已建立");
      } else {
        toast.error("确认失败", { description: result.code });
      }
    } finally {
      setBusy(false);
    }
  };

  const sendAgentMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const job = confirmation?.job;
    if (!job || !agentText.trim()) return;
    const actorId = agentSide === "customer" ? job.customerId : job.workerId;
    const result = communication.handle({
      tenantId: clinic.id,
      verticalId: vertical.id,
      jobId: job.jobId,
      from: agentSide,
      actorId,
      text: agentText.trim(),
      channel: "whatsapp",
    });
    setAgentResult(result);
    setAgentText("");
  };

  return (
    <PageContainer
      title="智能排程"
      subtitle={`${vertical.displayName} · 通用 Service Frontdesk Core · 请求、匹配、保留、确认与 Job 隐私边界`}
      actions={
        <MdChip tone="tertiary">
          <Sparkles className="size-3" />
          候选实现
        </MdChip>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-4">
          {bookings
            .filter((booking) =>
              ["SCHEDULED", "CUSTOMER_CONFIRMED", "WORKER_NOTIFIED", "IN_PROGRESS"].includes(
                booking.state,
              ),
            )
            .map((booking) => (
              <JourneyLaunch
                key={booking.bookingId}
                booking={booking}
                workerName={
                  workers.find((worker) => worker.workerId === booking.workerId)?.displayName ??
                  "師傅"
                }
                service={serviceLabel(booking.serviceType)}
              />
            ))}
          <MdCard variant="outlined" className="p-5">
            <SectionHeader
              title="1 · 收集服务请求"
              action={<MdChip tone="neutral">仅保存最少必要资料</MdChip>}
            />
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitRequest}>
              <MdSelect
                label={vertical.labels.customer}
                name="customerId"
                defaultValue={customers[0]?.id ?? ""}
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.displayName}
                  </option>
                ))}
              </MdSelect>
              <MdSelect
                label="服务类型"
                name="serviceType"
                defaultValue={vertical.services[0]?.id ?? ""}
              >
                {vertical.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </MdSelect>
              <MdTextField
                label="需要日期"
                type="date"
                name="requestedDate"
                defaultValue={localDateInput()}
              />
              <MdTextField label="希望时间" type="time" name="requestedTime" defaultValue="10:00" />
              <MdSelect label="紧急程度" name="urgency" defaultValue="normal">
                <option value="flexible">弹性</option>
                <option value="normal">一般</option>
                <option value="urgent">紧急</option>
                <option value="emergency">紧急事件</option>
              </MdSelect>
              <MdTextField
                label="预计服务时长（分钟，可留空）"
                type="number"
                min="15"
                step="15"
                name="estimatedDurationMin"
                placeholder="按服务能力估算"
              />
              <MdTextField
                label="服务地区"
                name="areaLabel"
                value={area.label}
                readOnly
                className="sm:col-span-2"
              />
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="md-label-m text-on-surface-variant">必要要求（每行一项）</span>
                <textarea
                  name="requirements"
                  rows={3}
                  placeholder="例如：需要自备环保用品"
                  className="rounded-lg border border-outline bg-surface-container-lowest px-4 py-3 md-body-m text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="md-body-s text-on-surface-variant">
                  完整地址不会进入匹配结果；候选浏览器不会持久化，生产确认时由 Private Data Vault
                  接管。
                </p>
                <MdButton
                  type="submit"
                  disabled={!customers.length || !vertical.services.length}
                  icon={<CalendarClock className="size-4" />}
                >
                  查找可选时段
                </MdButton>
              </div>
            </form>
          </MdCard>

          <MdCard variant="outlined" className="p-5">
            <SectionHeader
              title="2 · 候选时段与可解释原因"
              count={matching?.candidates.length ?? 0}
            />
            {matching?.candidates.length ? (
              <div className="space-y-3">
                {matching.candidates.map((candidate) => (
                  <div
                    key={candidate.candidateId}
                    className={cn(
                      "rounded-2xl border p-4",
                      hold?.candidateId === candidate.candidateId
                        ? "border-primary bg-primary-container/30"
                        : "border-outline-variant bg-surface-container-lowest",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="md-title-m text-on-surface">
                          {candidate.workerDisplayName} ·{" "}
                          {formatDateTime(candidate.startAt, clinic.timezone)}
                        </p>
                        <p className="mt-1 md-body-s text-on-surface-variant">
                          服务 {formatTime(candidate.startAt, clinic.timezone)}–
                          {formatTime(candidate.endAt, clinic.timezone)} · 占用含缓冲{" "}
                          {formatTime(candidate.occupancyStartAt, clinic.timezone)}–
                          {formatTime(candidate.occupancyEndAt, clinic.timezone)}
                        </p>
                      </div>
                      <MdChip tone={candidate.classification === "best" ? "primary" : "neutral"}>
                        #{candidate.rank} · {Math.round(candidate.score * 100)} 分
                      </MdChip>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {candidate.reasons.map((reason) => (
                        <MdChip key={reason} tone="secondary">
                          {REASON_LABELS[reason] ?? reason}
                        </MdChip>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <MdButton
                        size="sm"
                        variant={hold?.candidateId === candidate.candidateId ? "tonal" : "outlined"}
                        disabled={busy || Boolean(hold)}
                        onClick={() => void holdCandidate(candidate.candidateId)}
                        icon={<LockKeyhole className="size-4" />}
                      >
                        {hold?.candidateId === candidate.candidateId ? "已保留" : "保留 5 分钟"}
                      </MdButton>
                    </div>
                  </div>
                ))}
                {matching.excluded.length > 0 && (
                  <p className="md-body-s text-on-surface-variant">
                    其他人员未入选：
                    {matching.excluded
                      .map(
                        (item) =>
                          `${item.workerId}（${EXCLUSION_LABELS[item.reason] ?? item.reason}）`,
                      )
                      .join("、")}
                  </p>
                )}
              </div>
            ) : (
              <EmptyState
                text={
                  activeRequest
                    ? "当前请求没有可用候选，请调整时间、服务类型或地区。"
                    : "提交一个服务请求后，这里会显示带原因的候选结果。"
                }
              />
            )}
          </MdCard>

          {hold && !confirmation && (
            <MdCard
              variant="filled"
              className="bg-secondary-container p-5 text-on-secondary-container"
            >
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="md-title-m">时段暂时保留</p>
                  <p className="mt-1 md-body-m">
                    {formatDateTime(hold.startAt, clinic.timezone)} ·{" "}
                    {workers.find((worker) => worker.workerId === hold.workerId)?.displayName ??
                      hold.workerId}
                  </p>
                  <p className="mt-1 md-body-s">
                    保留至 {formatDateTime(hold.expiresAt, clinic.timezone)}
                    。确认前仍会再次检查冲突、人员状态和隐私策略。
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <MdTextField
                  label="完整服务地址（生产由 Private Data Vault 接管）"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="候选环境不会持久化，可按政策在生产补充"
                />
                <MdButton
                  onClick={() => void confirmHold()}
                  disabled={busy}
                  icon={<CheckCircle2 className="size-4" />}
                >
                  确认服务
                </MdButton>
              </div>
              <p className="mt-3 md-body-s">
                隐私提示：客户与 Worker 只会看到当前 Job
                的公开身份和必要服务资料；私人电话号码默认不交换。
              </p>
            </MdCard>
          )}

          {confirmation?.ok && confirmation.booking && confirmation.job && (
            <MdCard
              variant="filled"
              className="bg-tertiary-container p-5 text-on-tertiary-container"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="md-title-m">服务已建立 Job</p>
                    <MdChip tone="tertiary">{statusLabel(confirmation.booking.state)}</MdChip>
                  </div>
                  <p className="mt-2 md-body-m">
                    Customer #
                    {confirmation.job.customerIdentity.publicId.split("#")[1]?.trim() ?? ""} 与
                    Worker #{confirmation.job.workerIdentity.publicId.split("#")[1]?.trim() ?? ""}{" "}
                    已通过 Job 身份连接。
                  </p>
                  <p className="mt-1 md-body-s">
                    通知队列 {confirmation.notificationIntents.length} 项 · Work Item{" "}
                    {confirmation.workItems.length} 项 · Privacy Context 已创建
                  </p>
                  <div className="mt-3 rounded-2xl bg-surface/50 p-3 md-body-s">
                    <p className="flex items-center gap-2">
                      <LockKeyhole className="size-4" />
                      双方默认看不到私人电话；完整地址只在接近服务、目的绑定且取得同意时放行。
                    </p>
                  </div>
                </div>
              </div>
            </MdCard>
          )}

          {confirmation?.job && (
            <MdCard variant="outlined" className="p-5">
              <SectionHeader
                title="Job Conversation · 双 Agent 视图"
                action={
                  <MdChip tone="neutral">
                    <MessageSquareText className="size-3" />
                    只接受结构化意图
                  </MdChip>
                }
              />
              <p className="md-body-s text-on-surface-variant">
                Customer Agent 与 Worker Agent 只在当前 Job
                内协作；涉及私人资料、无法理解或人工接管的请求会被阻断或转人工。
              </p>
              <form
                className="mt-4 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end"
                onSubmit={sendAgentMessage}
              >
                <MdSelect
                  label="模拟发信方"
                  value={agentSide}
                  onChange={(event) => setAgentSide(event.target.value as JobAgentSide)}
                >
                  <option value="customer">Customer Agent</option>
                  <option value="worker">Worker Agent</option>
                </MdSelect>
                <MdTextField
                  label="当前 Job 消息"
                  value={agentText}
                  onChange={(event) => setAgentText(event.target.value)}
                  placeholder="例如：请改到下午 3:30；或输入 STOP/电话请求测试边界"
                />
                <MdButton
                  type="submit"
                  disabled={!agentText.trim()}
                  icon={<Send className="size-4" />}
                >
                  解析意图
                </MdButton>
              </form>
              {agentResult && (
                <div
                  className={cn(
                    "mt-4 rounded-2xl p-4",
                    agentResult.blocked
                      ? "bg-error-container text-on-error-container"
                      : "bg-surface-container",
                  )}
                >
                  <p className="md-label-l">
                    {agentResult.blocked
                      ? "已阻断"
                      : agentResult.requiresHuman
                        ? "转人工"
                        : "已形成待策略处理意图"}{" "}
                    · {agentResult.intent?.kind ?? "未建立意图"}
                  </p>
                  <p className="mt-1 md-body-m">{agentResult.reply}</p>
                  {agentResult.privacyCode && (
                    <p className="mt-1 md-body-s">Privacy Broker：{agentResult.privacyCode}</p>
                  )}
                </div>
              )}
            </MdCard>
          )}
        </div>

        <div className="space-y-4">
          <MdCard variant="outlined" className="p-5">
            <SectionHeader
              title="Worker Schedule"
              count={workers.length}
              action={<Users className="size-5 text-primary" />}
            />
            <div className="space-y-3">
              {workers.map((worker) => {
                const workerBookings = bookings.filter(
                  (booking) =>
                    booking.workerId === worker.workerId &&
                    booking.state !== "CANCELLED" &&
                    booking.state !== "EXPIRED",
                );
                return (
                  <div key={worker.workerId} className="rounded-2xl bg-surface-container-low p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="md-title-m truncate">{worker.displayName}</p>
                        <p className="mt-1 flex items-center gap-1 md-body-s text-on-surface-variant">
                          <MapPin className="size-3.5" />
                          {area.label}
                        </p>
                      </div>
                      <MdChip tone={worker.status === "active" ? "primary" : "error"}>
                        {worker.status === "active" ? "可接单" : worker.status}
                      </MdChip>
                    </div>
                    <p className="mt-3 md-body-s text-on-surface-variant">
                      能力：
                      {worker.capabilities
                        .slice(0, 4)
                        .map((capability) => serviceLabel(capability.serviceTypeId))
                        .join("、")}
                      {worker.capabilities.length > 4 ? "…" : ""}
                    </p>
                    <p className="mt-1 md-body-s text-on-surface-variant">
                      缓冲：移动 {worker.defaultTravelBufferMin} 分钟 · 准备{" "}
                      {worker.preparationBufferMin} 分钟 · 清理 {worker.cleanupBufferMin} 分钟
                    </p>
                    <p className="mt-1 md-body-s text-on-surface-variant">
                      每周：
                      {worker.weeklyAvailability
                        .map(
                          (rule) => `${dayLabel(rule.weekday)} ${rule.startTime}-${rule.endTime}`,
                        )
                        .join(" · ")}
                    </p>
                    <div className="mt-3 border-t border-outline-variant pt-3">
                      <p className="md-label-m text-on-surface-variant">已有 Job</p>
                      {workerBookings.length ? (
                        workerBookings.map((booking) => (
                          <p key={booking.bookingId} className="mt-1 md-body-s">
                            {formatDateTime(booking.startAt, clinic.timezone)} ·{" "}
                            {serviceLabel(booking.serviceType)} · {statusLabel(booking.state)}
                          </p>
                        ))
                      ) : (
                        <p className="mt-1 md-body-s text-on-surface-variant">
                          当前没有已确认工作。
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </MdCard>

          <MdCard variant="outlined" className="p-5">
            <SectionHeader
              title="隐私与执行边界"
              action={<ShieldCheck className="size-5 text-primary" />}
            />
            <div className="space-y-3 md-body-m">
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                匹配阶段只使用服务、时段、能力、地区和缓冲等必要字段。
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                Customer #… 与 Worker #… 是 Job 公开身份，不替代真实账号或电话号码。
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                所有 WhatsApp 主动通知必须经过既有 Policy Gate、opt-in、STOP/human-only 和 24
                小时窗口判断。
              </p>
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                Confirm 会再次检查 Hold、冲突、租户、垂直行业和 Worker
                状态，失败则回滚本地聚合写入。
              </p>
            </div>
          </MdCard>

          {currentStaff && (
            <p className="md-body-s text-on-surface-variant">
              当前操作人：{currentStaff.name} ·
              本页为本地候选运行时，真实生产通知和后端事务仍需部署验证。
            </p>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
