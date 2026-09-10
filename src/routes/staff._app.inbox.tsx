import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  FlaskConical,
  Globe,
  Hand,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip } from "@/components/m3";
import { serviceConversationIngestRuntime } from "@/conversations/ingest-runtime";
import { useServiceConversations } from "@/conversations/use-service-conversations";
import { clinicToServiceTenant } from "@/core/tenant";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { summarizeServiceConversationForFrontdesk } from "@/frontdesk/conversation-summary";
import { MockWhatsAppAdapter } from "@/integrations/messaging-adapter";
import { CHANNEL, CONVERSATION_STATE, fmtTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app-store";
import type { ChannelKind } from "@/types/domain";
import { safetyBoundaryText, safetyFlagLabel } from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/inbox")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search["c"] === "string" ? (search["c"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "對話｜Service Frontdesk" },
      {
        name: "description",
        content: "WhatsApp、電話與網頁訊息統一收件匣，支援 AI 摘要與人工接管。",
      },
    ],
  }),
  component: InboxPage,
});

const channelIcon: Record<ChannelKind, typeof Phone> = {
  whatsapp: MessageCircle,
  phone: Phone,
  web: Globe,
};

function demoMessage(verticalId: string): string {
  switch (verticalId) {
    case "pet-care":
      return "我想预约下星期帮豆豆冲凉，有冇位？";
    case "auto-repair":
      return "我想预约下星期做定期保养，有冇入厂时段？";
    case "home-service":
      return "我想预约下星期上门清洁，有冇时段？";
    case "beauty":
      return "我想预约下星期做护理，有冇位？";
    default:
      return "我想预约下星期，有冇位？";
  }
}

function InboxPage() {
  const {
    clinic,
    patients,
    conversations: legacyConversations,
    urgentFlags,
    patientName,
    currentStaff,
    takeOverConversation,
    sendReply,
    sendAgentDraft,
    escalateUrgentFlag,
  } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customers } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const workspace = useServiceConversations({
    tenantId: clinic.id,
    vertical,
    legacyConversations,
    legacyActions: {
      takeOver: takeOverConversation,
      sendReply,
      sendAgentDraft,
    },
  });
  const { c } = Route.useSearch();
  const navigate = useNavigate({ from: "/staff/inbox" });
  const [filter, setFilter] = useState<"all" | "unread" | "urgent" | "agent">("all");
  const [draft, setDraft] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);

  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.displayName ?? patientName(id);

  const filtered = workspace.conversations.filter((conversation) => {
    if (filter === "unread") return conversation.unread;
    if (filter === "urgent")
      return Boolean(conversation.safetySignal || conversation.legacyUrgentFlagId);
    if (filter === "agent") return conversation.state === "agent_handling";
    return true;
  });

  const requested = c
    ? workspace.conversations.find((conversation) => conversation.id === c)
    : undefined;
  const selected = requested ?? filtered[0] ?? workspace.conversations[0];
  const selectedId = selected?.id;
  const legacyFlag = selected?.legacyUrgentFlagId
    ? urgentFlags.find((item) => item.id === selected.legacyUrgentFlagId)
    : undefined;
  const frontdeskSummary = selected
    ? summarizeServiceConversationForFrontdesk({
        tenantId: clinic.id,
        conversation: selected,
        vertical,
      })
    : null;

  const simulateInbound = async () => {
    const customer = customers[0];
    if (!customer) {
      toast.error("先建立一位客戶", { description: "可先到「客戶」用拍照匯入建立示範客戶。" });
      return;
    }
    setDemoBusy(true);
    try {
      const adapter = new MockWhatsAppAdapter();
      const receipt = await serviceConversationIngestRuntime.ingest({
        tenant: clinicToServiceTenant(clinic, vertical.id),
        vertical,
        customerName: customer.displayName,
        messagingAdapter: adapter,
        message: {
          providerMessageId: `demo_in_${Date.now().toString(36)}`,
          tenantId: clinic.id,
          customerId: customer.id,
          channel: "whatsapp",
          text: demoMessage(vertical.id),
          receivedAt: new Date().toISOString(),
        },
      });
      if (!receipt.persisted || !receipt.conversation) {
        toast.error("示範訊息未寫入", { description: receipt.errors[0] ?? "未知錯誤" });
        return;
      }
      toast.success("示範 WhatsApp 已進入對話", {
        description: receipt.frontdesk?.autoReplyReceipt?.ok
          ? "AI 已完成模擬回覆，來回訊息均已保存。"
          : receipt.state === "waiting_human"
            ? "此訊息需要人工接管。"
            : "訊息已保存。",
      });
      navigate({ to: ".", search: { c: receipt.conversation.id } });
    } catch (error) {
      toast.error("示範入站失敗", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <PageContainer
      title="對話"
      subtitle={`${vertical.displayName} · WhatsApp／電話／網頁`}
      actions={
        vertical.id !== "dental" ? (
          <MdButton
            size="sm"
            variant="outlined"
            icon={<FlaskConical className="size-4" />}
            onClick={() => void simulateInbound()}
            disabled={demoBusy}
          >
            模擬 WhatsApp 來訊
          </MdButton>
        ) : undefined
      }
    >
      {vertical.id !== "dental" && workspace.conversations.length === 0 && (
        <MdCard className="mb-4 border border-outline-variant bg-surface-container p-3">
          <p className="md-body-s text-on-surface-variant">
            目前尚未有對話。右上角可用 Demo 訊息快速試一次自動回覆與人工接管流程。
          </p>
        </MdCard>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "全部"],
            ["unread", "未讀"],
            ["urgent", safetyFlagLabel(vertical)],
            ["agent", "AI 處理中"],
          ] as const
        ).map(([value, label]) => (
          <MdFilterChip key={value} selected={filter === value} onClick={() => setFilter(value)}>
            {label}
          </MdFilterChip>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <MdCard className="max-h-[70vh] divide-y divide-outline-variant overflow-y-auto">
          {filtered.length === 0 && <EmptyState text="沒有符合條件的對話。" />}
          {filtered.map((conversation) => {
            const Icon = channelIcon[conversation.channel];
            const state = CONVERSATION_STATE[conversation.state];
            const summary = summarizeServiceConversationForFrontdesk({
              tenantId: clinic.id,
              conversation,
              vertical,
            });
            return (
              <button
                key={conversation.id}
                onClick={() => navigate({ to: ".", search: { c: conversation.id } })}
                className={cn(
                  "state-layer flex w-full gap-3 p-4 text-left",
                  conversation.id === selectedId && "bg-secondary-container/60",
                )}
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="md-title-m truncate text-on-surface">
                      {customerName(conversation.customerId)}
                    </span>
                    <span className="md-body-s text-on-surface-variant">
                      {fmtTime(conversation.lastAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate md-body-m text-on-surface-variant">
                    {conversation.messages[conversation.messages.length - 1]?.text}
                  </span>
                  <span className="mt-1 block truncate md-body-s text-primary">
                    {summary.title}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1">
                    <MdChip tone={state.tone}>{state.label}</MdChip>
                    {(conversation.safetySignal || conversation.legacyUrgentFlagId) && (
                      <MdChip tone="error">{safetyFlagLabel(vertical)}</MdChip>
                    )}
                    {conversation.unread && <MdChip tone="primary">未讀</MdChip>}
                    {conversation.source === "legacy_conversation_compat" && (
                      <MdChip tone="neutral">既有牙科對話</MdChip>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </MdCard>

        {selected ? (
          <MdCard className="flex max-h-[70vh] flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant p-4">
              <div className="min-w-0 flex-1">
                <p className="md-title-m truncate text-on-surface">
                  {customerName(selected.customerId)} · {selected.subject}
                </p>
                <p className="md-body-s text-on-surface-variant">
                  {CHANNEL[selected.channel]} · {CONVERSATION_STATE[selected.state].label} ·
                  Customer ↔ 平台 Agent
                </p>
              </div>
              {selected.state !== "human" && (
                <MdButton
                  size="sm"
                  variant="tonal"
                  icon={<Hand className="size-4" />}
                  onClick={() => workspace.takeOver(selected.id, currentStaff.id)}
                >
                  人工接管
                </MdButton>
              )}
            </div>

            {frontdeskSummary && (
              <div className="border-b border-outline-variant bg-secondary-container/35 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="md-label-l text-on-surface">AI 摘要</p>
                      <MdChip tone={frontdeskSummary.decision.requiresHuman ? "error" : "primary"}>
                        {frontdeskSummary.decision.requiresHuman ? "需要人手" : "可由流程處理"}
                      </MdChip>
                      {frontdeskSummary.decision.autoSendAllowed && (
                        <MdChip tone="tertiary">可自動回覆</MdChip>
                      )}
                    </div>
                    <p className="mt-2 md-title-m text-on-surface">{frontdeskSummary.title}</p>
                    <p className="mt-1 md-body-m text-on-surface-variant">
                      {frontdeskSummary.detail}
                    </p>
                    <div className="mt-2 flex items-start gap-2 rounded-xl bg-surface-container p-3">
                      <ClipboardList className="mt-0.5 size-4 shrink-0 text-primary" />
                      <p className="md-body-s text-on-surface-variant">
                        下一步：{frontdeskSummary.nextAction}
                      </p>
                    </div>
                    {frontdeskSummary.decision.suggestedReply &&
                      selected.state !== "agent_handling" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <MdButton
                            size="sm"
                            variant="tonal"
                            onClick={() => setDraft(frontdeskSummary.decision.suggestedReply ?? "")}
                          >
                            使用建議回覆
                          </MdButton>
                          <span className="self-center md-body-s text-on-surface-variant">
                            發送前仍可修改。
                          </span>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            )}

            {(selected.safetySignal || legacyFlag) && (
              <div className="border-b border-outline-variant bg-error-container/40 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" />
                  <div className="flex-1">
                    <p className="md-label-l text-on-surface">{safetyFlagLabel(vertical)}</p>
                    <p className="mt-1 md-body-s text-on-surface-variant">
                      {vertical.labels.customer}原話：「
                      {selected.safetySignal?.quote ?? legacyFlag?.quote ?? ""}」
                    </p>
                    <p className="md-body-s text-on-surface-variant">
                      觸發：
                      {selected.safetySignal?.matchedKeywords.join("、") ||
                        legacyFlag?.matchedKeywords.join("、") ||
                        "規則命中"}
                    </p>
                    <p className="mt-1 md-body-s text-on-surface-variant">
                      {safetyBoundaryText(vertical)}
                    </p>
                    {selected.source === "legacy_conversation_compat" && legacyFlag && (
                      <MdButton
                        size="sm"
                        variant="danger"
                        className="mt-2"
                        onClick={() => escalateUrgentFlag(legacyFlag.id)}
                      >
                        立即轉人工
                      </MdButton>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.from === "customer" ? "justify-start" : "justify-end",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2",
                      message.from === "customer" && "bg-surface-container-highest text-on-surface",
                      message.from === "staff" && "bg-primary-container text-on-primary-container",
                      message.from === "agent" &&
                        "bg-tertiary-container text-on-tertiary-container",
                    )}
                  >
                    <p className="md-label-m flex items-center gap-1 opacity-80">
                      {message.from === "agent" && <Bot className="size-3" />}
                      {message.authorName} · {fmtTime(message.at)}
                      {message.draft && " · 草稿待批"}
                    </p>
                    <p className="mt-1 md-body-m whitespace-pre-wrap">{message.text}</p>
                    {message.draft && selected.source === "legacy_conversation_compat" && (
                      <div className="mt-2 flex gap-2">
                        <MdButton
                          size="sm"
                          variant="filled"
                          onClick={() => workspace.approveLegacyAgentDraft(selected.id, message.id)}
                        >
                          批准發送
                        </MdButton>
                        <MdButton
                          size="sm"
                          variant="text"
                          onClick={() => workspace.takeOver(selected.id, currentStaff.id)}
                        >
                          改為人手處理
                        </MdButton>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form
              className="flex items-end gap-2 border-t border-outline-variant p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                const ok = workspace.sendStaffReply({
                  conversationId: selected.id,
                  staffId: currentStaff.id,
                  staffName: currentStaff.name,
                  text: draft.trim(),
                });
                if (ok) setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={`回覆${vertical.labels.customer}…`}
                className="h-12 flex-1 rounded-full border border-outline bg-surface-container-lowest px-4 md-body-m text-on-surface outline-none focus:border-primary"
              />
              <MdButton type="submit" icon={<Send className="size-4" />}>
                發送
              </MdButton>
            </form>
          </MdCard>
        ) : (
          <EmptyState text={`目前沒有屬於 ${vertical.shortName} 的對話。`} />
        )}
      </div>
    </PageContainer>
  );
}
