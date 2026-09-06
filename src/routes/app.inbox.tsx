import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bot, Hand, Phone, Send, Globe, MessageCircle } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/AppShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip } from "@/components/m3";
import { CHANNEL, CONVERSATION_STATE, fmtTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app-store";
import type { ChannelKind } from "@/types/domain";

export const Route = createFileRoute("/app/inbox")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search.c === "string" ? search.c : undefined,
  }),
  head: () => ({
    meta: [
      { title: "對話中心｜診所行政 Agent" },
      { name: "description", content: "WhatsApp、電話與網頁訊息統一收件匣，支援 AI 建議與人工接管。" },
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
    conversations,
    urgentFlags,
    patientName,
    takeOverConversation,
    sendReply,
    sendAgentDraft,
    escalateUrgentFlag,
  } = useApp();
  const { c } = Route.useSearch();
  const navigate = useNavigate({ from: "/app/inbox" });
  const [filter, setFilter] = useState<"all" | "unread" | "urgent" | "agent">("all");
  const [draft, setDraft] = useState("");

  const filtered = conversations.filter((cv) => {
    if (filter === "unread") return cv.unread;
    if (filter === "urgent") return !!cv.urgentFlagId;
    if (filter === "agent") return cv.state === "agent_handling";
    return true;
  });

  const selectedId = c ?? filtered[0]?.id ?? conversations[0]?.id;
  const selected = conversations.find((cv) => cv.id === selectedId);
  const flag = selected?.urgentFlagId
    ? urgentFlags.find((f) => f.id === selected.urgentFlagId)
    : undefined;

  return (
    <PageContainer title="對話中心" subtitle="WhatsApp／電話／網頁訊息統一收件匣（模擬適配器）">
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "全部"],
            ["unread", "未讀"],
            ["urgent", "緊急標記"],
            ["agent", "Agent 處理中"],
          ] as const
        ).map(([v, label]) => (
          <MdFilterChip key={v} selected={filter === v} onClick={() => setFilter(v)}>
            {label}
          </MdFilterChip>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <MdCard className="max-h-[70vh] divide-y divide-outline-variant overflow-y-auto">
          {filtered.length === 0 && <EmptyState text="沒有符合條件的對話。" />}
          {filtered.map((cv) => {
            const Icon = channelIcon[cv.channel];
            const state = CONVERSATION_STATE[cv.state];
            return (
              <button
                key={cv.id}
                onClick={() => navigate({ to: ".", search: { c: cv.id } })}
                className={cn(
                  "state-layer flex w-full gap-3 p-4 text-left",
                  cv.id === selectedId && "bg-secondary-container/60",
                )}
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="md-title-m truncate text-on-surface">
                      {patientName(cv.patientId)}
                    </span>
                    <span className="md-body-s text-on-surface-variant">{fmtTime(cv.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate md-body-m text-on-surface-variant">
                    {cv.messages[cv.messages.length - 1]?.text}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1">
                    <MdChip tone={state.tone}>{state.label}</MdChip>
                    {cv.urgentFlagId && <MdChip tone="error">緊急</MdChip>}
                    {cv.unread && <MdChip tone="primary">未讀</MdChip>}
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
                  {patientName(selected.patientId)}・{selected.subject}
                </p>
                <p className="md-body-s text-on-surface-variant">
                  {CHANNEL[selected.channel]}・{CONVERSATION_STATE[selected.state].label}
                </p>
              </div>
              {selected.state !== "human" && (
                <MdButton size="sm" variant="tonal" icon={<Hand className="size-4" />} onClick={() => takeOverConversation(selected.id)}>
                  人工接管
                </MdButton>
              )}
            </div>

            {flag && (
              <div className="border-b border-outline-variant bg-error-container/40 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" />
                  <div className="flex-1">
                    <p className="md-label-l text-on-surface">潛在緊急標記（非診斷）</p>
                    <p className="mt-1 md-body-s text-on-surface-variant">
                      病人原話：「{flag.quote}」
                    </p>
                    <p className="md-body-s text-on-surface-variant">觸發原因：{flag.rule}</p>
                    <MdButton
                      size="sm"
                      variant="danger"
                      className="mt-2"
                      onClick={() => escalateUrgentFlag(flag.id)}
                    >
                      立即轉人工
                    </MdButton>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex", m.from === "patient" ? "justify-start" : "justify-end")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2",
                      m.from === "patient" && "bg-surface-container-highest text-on-surface",
                      m.from === "staff" && "bg-primary-container text-on-primary-container",
                      m.from === "agent" && "bg-tertiary-container text-on-tertiary-container",
                    )}
                  >
                    <p className="md-label-m flex items-center gap-1 opacity-80">
                      {m.from === "agent" && <Bot className="size-3" />}
                      {m.authorName}・{fmtTime(m.at)}
                      {m.draft && "・草稿待批"}
                    </p>
                    <p className="mt-1 md-body-m whitespace-pre-wrap">{m.text}</p>
                    {m.draft && (
                      <div className="mt-2 flex gap-2">
                        <MdButton size="sm" variant="filled" onClick={() => sendAgentDraft(selected.id, m.id)}>
                          批准發送
                        </MdButton>
                        <MdButton size="sm" variant="text" onClick={() => takeOverConversation(selected.id)}>
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
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                sendReply(selected.id, draft.trim());
                setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="輸入回覆…（發送即代表人工接管）"
                className="h-12 flex-1 rounded-full border border-outline bg-surface-container-lowest px-4 md-body-m text-on-surface outline-none focus:border-primary"
              />
              <MdButton type="submit" icon={<Send className="size-4" />}>
                發送
              </MdButton>
            </form>
          </MdCard>
        ) : (
          <EmptyState text="請選擇一個對話。" />
        )}
      </div>
    </PageContainer>
  );
}
