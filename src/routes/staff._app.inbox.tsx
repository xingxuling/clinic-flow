import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  Globe,
  Hand,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip } from "@/components/m3";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { summarizeConversationForFrontdesk } from "@/frontdesk/conversation-summary";
import { CHANNEL, CONVERSATION_STATE, fmtTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app-store";
import type { ChannelKind } from "@/types/domain";
import { filterByVertical } from "@/verticals/entity-scope";
import { safetyBoundaryText, safetyFlagLabel } from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/inbox")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search["c"] === "string" ? (search["c"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "對話中心｜Service Frontdesk" },
      { name: "description", content: "WhatsApp、電話與網頁訊息統一收件匣，支援行政摘要、AI 建議與人工接管。" },
    ],
  }),
  component: InboxPage,
});

const channelIcon: Record<ChannelKind, typeof Phone> = {
  whatsapp: MessageCircle,
  phone: Phone,
  web: Globe,
};

function InboxPage() {
  const {
    clinic,
    patients,
    conversations,
    urgentFlags,
    patientName,
    takeOverConversation,
    sendReply,
    sendAgentDraft,
    escalateUrgentFlag,
  } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customers } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const { c } = Route.useSearch();
  const navigate = useNavigate({ from: "/staff/inbox" });
  const [filter, setFilter] = useState<"all" | "unread" | "urgent" | "agent">("all");
  const [draft, setDraft] = useState("");

  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.displayName ?? patientName(id);

  const visibleConversations = useMemo(
    () => filterByVertical(conversations, vertical.id),
    [conversations, vertical.id],
  );
  const visibleFlags = useMemo(
    () => filterByVertical(urgentFlags, vertical.id),
    [urgentFlags, vertical.id],
  );

  const filtered = visibleConversations.filter((conversation) => {
    if (filter === "unread") return conversation.unread;
    if (filter === "urgent") return !!conversation.urgentFlagId;
    if (filter === "agent") return conversation.state === "agent_handling";
    return true;
  });

  const requested = c ? visibleConversations.find((conversation) => conversation.id === c) : undefined;
  const selected = requested ?? filtered[0] ?? visibleConversations[0];
  const selectedId = selected?.id;
  const flag = selected?.urgentFlagId
    ? visibleFlags.find((item) => item.id === selected.urgentFlagId)
    : undefined;
  const frontdeskSummary = selected
    ? summarizeConversationForFrontdesk({ clinic, conversation: selected, vertical })
    : null;

  return (
    <PageContainer
      title="對話中心"
      subtitle={`${vertical.displayName} · WhatsApp／電話／網頁統一收件匣`}
    >
      {vertical.id !== "dental" && visibleConversations.length === 0 && (
        <MdCard className="mb-4 border border-outline-variant bg-surface-container p-3">
          <p className="md-body-s text-on-surface-variant">
            此行業目前尚未建立對話；舊 Dental Seed 已由 vertical scope 隔離。正式訊息會由 Messaging Adapter 帶上目前行業身份後進入同一 Inbox。
          </p>
        </MdCard>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "全部"],
            ["unread", "未讀"],
            ["urgent", safetyFlagLabel(vertical)],
            ["agent", "Agent 處理中"],
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
            const summary = summarizeConversationForFrontdesk({ clinic, conversation, vertical });
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
                    <span className="md-title-m truncate text-on-surface">{customerName(conversation.patientId)}</span>
                    <span className="md-body-s text-on-surface-variant">{fmtTime(conversation.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate md-body-m text-on-surface-variant">
                    {conversation.messages[conversation.messages.length - 1]?.text}
                  </span>
                  <span className="mt-1 block truncate md-body-s text-primary">{summary.title}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1">
                    <MdChip tone={state.tone}>{state.label}</MdChip>
                    {conversation.urgentFlagId && <MdChip tone="error">{safetyFlagLabel(vertical)}</MdChip>}
                    {conversation.unread && <MdChip tone="primary">未讀</MdChip>}
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
                  {customerName(selected.patientId)} · {selected.subject}
                </p>
                <p className="md-body-s text-on-surface-variant">
                  {CHANNEL[selected.channel]} · {CONVERSATION_STATE[selected.state].label} · {vertical.labels.customer}
                </p>
              </div>
              {selected.state !== "human" && (
                <MdButton size="sm" variant="tonal" icon={<Hand className="size-4" />} onClick={() => takeOverConversation(selected.id)}>
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
                      <p className="md-label-l text-on-surface">AI 前台摘要</p>
                      <MdChip tone={frontdeskSummary.decision.requiresHuman ? "error" : "primary"}>
                        {frontdeskSummary.decision.requiresHuman ? "需要人手" : "可由流程處理"}
                      </MdChip>
                      {frontdeskSummary.decision.autoSendAllowed && <MdChip tone="tertiary">允許自動回覆</MdChip>}
                    </div>
                    <p className="mt-2 md-title-m text-on-surface">{frontdeskSummary.title}</p>
                    <p className="mt-1 md-body-m text-on-surface-variant">{frontdeskSummary.detail}</p>
                    <div className="mt-2 flex items-start gap-2 rounded-xl bg-surface-container p-3">
                      <ClipboardList className="mt-0.5 size-4 shrink-0 text-primary" />
                      <p className="md-body-s text-on-surface-variant">下一步：{frontdeskSummary.nextAction}</p>
                    </div>
                    {frontdeskSummary.decision.suggestedReply && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <MdButton size="sm" variant="tonal" onClick={() => setDraft(frontdeskSummary.decision.suggestedReply ?? "")}>
                          填入建議回覆
                        </MdButton>
                        <span className="self-center md-body-s text-on-surface-variant">
                          建議文字只處理已授權行政／服務流程；發送前仍可修改。
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {flag && (
              <div className="border-b border-outline-variant bg-error-container/40 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" />
                  <div className="flex-1">
                    <p className="md-label-l text-on-surface">{safetyFlagLabel(vertical)}</p>
                    <p className="mt-1 md-body-s text-on-surface-variant">
                      {vertical.labels.customer}原話：「{flag.quote}」
                    </p>
                    <p className="md-body-s text-on-surface-variant">觸發原因：{flag.rule}</p>
                    <p className="mt-1 md-body-s text-on-surface-variant">{safetyBoundaryText(vertical)}</p>
                    <MdButton size="sm" variant="danger" className="mt-2" onClick={() => escalateUrgentFlag(flag.id)}>
                      立即轉人工
                    </MdButton>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.map((message) => (
                <div key={message.id} className={cn("flex", message.from === "patient" ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2",
                      message.from === "patient" && "bg-surface-container-highest text-on-surface",
                      message.from === "staff" && "bg-primary-container text-on-primary-container",
                      message.from === "agent" && "bg-tertiary-container text-on-tertiary-container",
                    )}
                  >
                    <p className="md-label-m flex items-center gap-1 opacity-80">
                      {message.from === "agent" && <Bot className="size-3" />}
                      {message.authorName} · {fmtTime(message.at)}{message.draft && " · 草稿待批"}
                    </p>
                    <p className="mt-1 md-body-m whitespace-pre-wrap">{message.text}</p>
                    {message.draft && (
                      <div className="mt-2 flex gap-2">
                        <MdButton size="sm" variant="filled" onClick={() => sendAgentDraft(selected.id, message.id)}>批准發送</MdButton>
                        <MdButton size="sm" variant="text" onClick={() => takeOverConversation(selected.id)}>改為人手處理</MdButton>
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
                sendReply(selected.id, draft.trim());
                setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={`回覆${vertical.labels.customer}…（發送即代表人工接管）`}
                className="h-12 flex-1 rounded-full border border-outline bg-surface-container-lowest px-4 md-body-m text-on-surface outline-none focus:border-primary"
              />
              <MdButton type="submit" icon={<Send className="size-4" />}>發送</MdButton>
            </form>
          </MdCard>
        ) : (
          <EmptyState text={`目前沒有屬於 ${vertical.shortName} 的對話。`} />
        )}
      </div>
    </PageContainer>
  );
}
