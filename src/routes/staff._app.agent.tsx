import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, MessageCircle, PencilRuler, ShieldAlert, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip, SectionHeader } from "@/components/m3";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { getAgentPlan } from "@/data/agent-plans";
import { MockWhatsAppAdapter } from "@/integrations/messaging-adapter";
import { executeAgentPlan } from "@/lib/agent-executor";
import {
  createAgentStoreRepository,
  requiredPermissionsForAgentPlan,
} from "@/lib/app-store-agent-adapter";
import { AGENT_STATUS, RISK, fmtDateTime, type Tone } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { AgentTaskStatus } from "@/types/domain";
import { filterByVertical } from "@/verticals/entity-scope";
import { safetyBoundaryText } from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";
import { serviceWorkItemDispatchRuntime } from "@/work-items/dispatch-runtime";
import { serviceWorkItemRepository } from "@/work-items/repository";
import type { ServiceWorkItemStatus } from "@/work-items/types";
import { useServiceWorkItems } from "@/work-items/use-service-work-items";

export const Route = createFileRoute("/staff/_app/agent")({
  head: () => ({
    meta: [
      { title: "Agent｜Service Frontdesk" },
      {
        name: "description",
        content: "查看待辦、人工批准、發送狀態與受控 Agent 操作。",
      },
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

const WORK_ITEM_STATUS: Record<ServiceWorkItemStatus, { label: string; tone: Tone }> = {
  waiting_approval: { label: "等待批准", tone: "tertiary" },
  ready_to_send: { label: "待發送", tone: "primary" },
  done: { label: "已完成", tone: "secondary" },
  rejected: { label: "已否決", tone: "neutral" },
};

function AgentPage() {
  const app = useApp();
  const {
    agentTasks,
    decideAgentTask,
    retryAgentTask,
    staffName,
    clinic,
    currentStaff,
    staff,
    patients,
    appointments,
    conversations,
    urgentFlags,
    reminders,
    documents,
    invites,
    auditEvents,
    can,
    setAppointmentStatus,
    rescheduleAppointment,
    createAppointment,
    sendReply,
    escalateUrgentFlag,
    updateReminderStatus,
  } = app;
  const vertical = useTenantVertical(clinic);
  const { customers } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const workItems = useServiceWorkItems(clinic.id, vertical.id);
  const [filter, setFilter] = useState<AgentTaskStatus | "all">("all");
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const verticalTasks = filterByVertical(agentTasks, vertical.id);
  const list = verticalTasks.filter((task) => filter === "all" || task.status === filter);
  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.displayName ?? `客戶 ${id}`;

  function approveWorkItem(id: string) {
    const item = workItems.find((row) => row.id === id);
    if (!item || item.status !== "waiting_approval") return;
    const updated = serviceWorkItemRepository.setStatus(
      clinic.id,
      item.id,
      "ready_to_send",
      currentStaff.id,
    );
    if (!updated) {
      toast.error("待辦不存在");
      return;
    }
    toast.success("草稿已批准", {
      description: "已進入待發送狀態；尚未聲稱訊息已送出。",
    });
  }

  function rejectWorkItem(id: string) {
    const item = workItems.find((row) => row.id === id);
    if (!item || item.status !== "waiting_approval") return;
    serviceWorkItemRepository.setStatus(clinic.id, item.id, "rejected", currentStaff.id);
    toast.success("待辦已否決");
  }

  async function dispatchWorkItem(id: string) {
    const item = workItems.find((row) => row.id === id);
    if (!item?.customerId) {
      toast.error("缺少客戶資料，未發送");
      return;
    }
    const customer = customers.find((row) => row.id === item.customerId);
    if (!customer) {
      toast.error("找不到客戶，未發送");
      return;
    }
    if (!can("conversation.reply")) {
      toast.error("權限不足，未發送", { description: "目前角色沒有回覆對話權限。" });
      return;
    }

    setDispatchingId(id);
    try {
      const adapter = new MockWhatsAppAdapter();
      const result = await serviceWorkItemDispatchRuntime.dispatch({
        tenantId: clinic.id,
        verticalId: vertical.id,
        workItemId: item.id,
        customer,
        adapter,
      });
      if (!result.ok) {
        toast.error("尚未發送", {
          description:
            result.errorCode === "CHANNEL_ADAPTER_MISMATCH"
              ? `客戶首選渠道是 ${customer.preferredChannel}，目前 Demo 只提供 WhatsApp 模擬發送。`
              : result.errorCode ?? "發送失敗",
        });
        return;
      }
      toast.success(result.duplicate ? "已核對既有發送回執" : "模擬 WhatsApp 已發送", {
        description: result.duplicate
          ? "沒有重複發送；如對話紀錄曾缺失，只補回本地紀錄。"
          : `發送回執：${result.sendReceipt?.providerMessageId ?? "已確認"}。對話已同步。`,
      });
    } catch (error) {
      toast.error("發送失敗", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setDispatchingId(null);
    }
  }

  function approveAndExecute(taskId: string) {
    const task = verticalTasks.find((row) => row.id === taskId);
    if (!task) {
      toast.error("任務不屬於目前行業", { description: "已阻止跨行業執行。" });
      return;
    }

    const plan = getAgentPlan(taskId);
    if (!plan) {
      toast.error("未執行", {
        description: "此任務沒有可執行步驟；系統不會把文字說明直接當成操作指令。",
      });
      return;
    }

    const missingPermissions = requiredPermissionsForAgentPlan(plan.operations).filter(
      (permission) => !can(permission),
    );
    if (missingPermissions.length > 0) {
      toast.error("權限不足，未執行", {
        description: `缺少：${missingPermissions.join("、")}`,
      });
      return;
    }

    const repository = createAgentStoreRepository({
      clinic,
      currentStaff,
      staff,
      patients,
      appointments,
      conversations,
      urgentFlags,
      agentTasks,
      reminders,
      documents,
      invites,
      auditEvents,
      can,
      setAppointmentStatus,
      rescheduleAppointment,
      createAppointment,
      sendReply,
      escalateUrgentFlag,
      updateReminderStatus,
    });

    const receipt = executeAgentPlan({
      repo: repository,
      clinicId: clinic.id,
      task,
      plan,
      humanApproved: true,
      approvedBy: currentStaff.id,
      approvedByName: currentStaff.name,
    });

    if (!receipt.ok) {
      toast.error("Agent 未執行", {
        description: receipt.errors[0] ?? "執行前驗證失敗。",
      });
      return;
    }

    decideAgentTask(taskId, true);
    toast.success("受控動作已執行", {
      description: `完成 ${receipt.operationCount} 個受控動作。`,
    });
  }

  return (
    <PageContainer
      title="Agent"
      subtitle={`${vertical.displayName} · 待辦、人工批准、發送與受控執行`}
    >
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MdCard className="p-4">
          <p className="md-label-l text-on-surface-variant">目前行業</p>
          <p className="mt-2 md-title-m text-on-surface">{vertical.displayName}</p>
          <p className="mt-1 md-body-s text-on-surface-variant">{vertical.labels.customer} · {vertical.labels.booking}</p>
        </MdCard>
        <MdCard className="p-4">
          <p className="md-label-l text-on-surface-variant">待辦</p>
          <p className="mt-2 text-2xl font-semibold text-on-surface">{workItems.length}</p>
          <p className="mt-1 md-body-s text-on-surface-variant">提醒、跟進、行政核對與發送任務</p>
        </MdCard>
        <MdCard className="p-4">
          <p className="md-label-l text-on-surface-variant">受限問題規則</p>
          <p className="mt-2 text-2xl font-semibold text-on-surface">{vertical.restrictedQuestionPatterns.length}</p>
          <p className="mt-1 md-body-s text-on-surface-variant">命中後不允許自由回答</p>
        </MdCard>
        <MdCard className="p-4">
          <p className="md-label-l text-on-surface-variant">人工批准門檻</p>
          <p className="mt-2 md-title-m text-on-surface">{vertical.defaultHumanApprovalLeadHours} 小時</p>
          <p className="mt-1 md-body-s text-on-surface-variant">接近服務時間的敏感改動優先轉人工</p>
        </MdCard>
      </div>

      <MdCard className="mb-5 border border-outline-variant bg-surface-container p-4">
        <p className="md-label-l text-on-surface">行業安全邊界</p>
        <p className="mt-1 md-body-s text-on-surface-variant">{safetyBoundaryText(vertical)}</p>
      </MdCard>

      <section className="mb-7">
        <SectionHeader title="待辦" count={workItems.length} />
        {workItems.length === 0 ? (
          <EmptyState text="目前沒有待辦；可從跟進、對話或資料流程建立。" />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {workItems.map((item) => {
              const status = WORK_ITEM_STATUS[item.status];
              const risk = RISK[item.risk];
              return (
                <MdCard key={item.id} className="p-5">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container">
                      <MessageCircle className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="md-title-m text-on-surface">{item.title}</p>
                      <p className="md-body-s text-on-surface-variant">
                        {fmtDateTime(item.createdAt)}
                        {item.customerId ? ` · ${customerName(item.customerId)}` : ""}
                      </p>
                    </div>
                    <MdChip tone={status.tone}>{status.label}</MdChip>
                    <MdChip tone={risk.tone}>{risk.label}</MdChip>
                  </div>

                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="md-label-m text-on-surface-variant">準備做什麼</dt>
                      <dd className="md-body-m text-on-surface">{item.intent}</dd>
                    </div>
                    <div>
                      <dt className="md-label-m text-on-surface-variant">依據</dt>
                      <dd className="md-body-s text-on-surface">
                        <ul className="mt-1 list-disc pl-5">
                          {item.basis.map((basis) => <li key={basis}>{basis}</li>)}
                        </ul>
                      </dd>
                    </div>
                  </dl>

                  {item.proposedMessage && (
                    <div className="mt-4 rounded-2xl bg-surface-container p-4">
                      <p className="md-label-m text-on-surface-variant">訊息草稿</p>
                      <p className="mt-2 whitespace-pre-wrap md-body-m text-on-surface">{item.proposedMessage}</p>
                    </div>
                  )}

                  {item.status === "waiting_approval" && (
                    <div className="mt-4 flex gap-2">
                      <MdButton size="sm" onClick={() => approveWorkItem(item.id)}>批准草稿</MdButton>
                      <MdButton size="sm" variant="outlined" onClick={() => rejectWorkItem(item.id)}>否決</MdButton>
                    </div>
                  )}
                  {item.status === "ready_to_send" && (
                    <div className="mt-4 rounded-xl bg-primary-container p-3 text-on-primary-container">
                      <p className="md-body-s">已批准，但尚未發送。正式環境會由已連接渠道執行。</p>
                      <MdButton
                        size="sm"
                        variant="tonal"
                        className="mt-3"
                        disabled={dispatchingId === item.id}
                        onClick={() => void dispatchWorkItem(item.id)}
                      >
                        模擬發送（Demo）
                      </MdButton>
                    </div>
                  )}
                  {item.status === "done" && item.dispatchReceipt && (
                    <div className="mt-4 rounded-xl bg-secondary-container p-3 md-body-s text-on-secondary-container">
                      發送回執：{item.dispatchReceipt.providerId} · {fmtDateTime(item.dispatchReceipt.sentAt)}
                      {item.dispatchReceipt.providerMessageId ? ` · ${item.dispatchReceipt.providerMessageId}` : ""}
                    </div>
                  )}
                </MdCard>
              );
            })}
          </div>
        )}
      </section>

      {verticalTasks.length > 0 && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title="既有 Agent 任務" count={list.length} />
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <MdFilterChip key={item.value} selected={filter === item.value} onClick={() => setFilter(item.value)}>
                  {item.label}
                </MdFilterChip>
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <EmptyState text="沒有符合條件的既有任務。" />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {list.map((task) => {
                const status = AGENT_STATUS[task.status];
                const risk = RISK[task.risk];
                const plan = getAgentPlan(task.id);
                return (
                  <MdCard key={task.id} className="p-5">
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                        <Bot className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="md-title-m text-on-surface">{task.title}</p>
                        <p className="md-body-s text-on-surface-variant">
                          建立於 {fmtDateTime(task.createdAt)}
                          {task.relatedPatientId && ` · ${customerName(task.relatedPatientId)}`}
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
                          <dd className="md-body-m text-on-surface">{task.intent}</dd>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Database className="mt-0.5 size-4 shrink-0 text-on-surface-variant" />
                        <div>
                          <dt className="md-label-m text-on-surface-variant">依據什麼</dt>
                          <dd className="md-body-m text-on-surface">
                            <ul className="list-disc pl-4">
                              {task.basis.map((basis) => <li key={basis}>{basis}</li>)}
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
                              {task.effects.map((effect) => <li key={effect}>{effect}</li>)}
                            </ul>
                          </dd>
                        </div>
                      </div>
                    </dl>

                    <div className="mt-3 rounded-2xl bg-surface-container p-3 md-body-s text-on-surface-variant">
                      {plan ? (
                        <>
                          <strong className="text-on-surface">可執行步驟：</strong>
                          {plan.operations.length} 個受控動作；批准前會先完整驗證，任何一項不合法則整單不執行。
                        </>
                      ) : (
                        <>
                          <strong className="text-on-surface">未配置執行步驟：</strong>
                          這項任務只有文字說明，批准動作會被安全阻止。
                        </>
                      )}
                    </div>

                    {task.failureReason && (
                      <p className="mt-3 flex items-start gap-2 rounded-lg bg-error-container p-3 md-body-s text-on-error-container">
                        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                        失敗原因：{task.failureReason}
                      </p>
                    )}

                    {task.decidedAt && (
                      <p className="mt-3 md-body-s text-on-surface-variant">
                        由 {task.decidedBy ? staffName(task.decidedBy) : "系統"} 於 {fmtDateTime(task.decidedAt)} 處理
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {task.status === "waiting_approval" && (
                        <>
                          <MdButton size="sm" onClick={() => approveAndExecute(task.id)} disabled={!plan}>批准並執行</MdButton>
                          <MdButton size="sm" variant="outlined" onClick={() => decideAgentTask(task.id, false)}>否決</MdButton>
                        </>
                      )}
                      {task.status === "failed" && (
                        <MdButton size="sm" variant="tonal" onClick={() => retryAgentTask(task.id)}>轉為待批重試</MdButton>
                      )}
                      {task.status === "auto_running" && <MdChip tone="primary">僅低風險任務可按規則自動執行</MdChip>}
                    </div>
                  </MdCard>
                );
              })}
            </div>
          )}
        </section>
      )}
    </PageContainer>
  );
}
