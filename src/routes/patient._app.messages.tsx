import { createFileRoute } from "@tanstack/react-router";
import { Bot, Globe2, Send, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PatientPage } from "@/components/layout/PatientShell";
import { MdButton, MdCard, MdChip } from "@/components/m3";
import { serviceConversationIngestRuntime } from "@/conversations/ingest-runtime";
import { useServiceCustomerConversation } from "@/conversations/use-service-customer-conversation";
import { clinicToServiceTenant } from "@/core/tenant";
import { LocalWebChatAdapter } from "@/integrations/messaging-adapter";
import { CONVERSATION_STATE, fmtDateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app-store";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/patient/_app/messages")({
  head: () => ({
    meta: [
      { title: "與診所的訊息｜晴和牙科中心" },
      { name: "description", content: "以本地網頁對話與診所前台及 Agent 溝通，不提供網上診症。" },
      { property: "og:title", content: "與診所的訊息｜晴和牙科中心" },
      { property: "og:description", content: "以本地網頁對話與診所前台就預約及行政事宜溝通。" },
    ],
  }),
  component: PatientMessages,
});

interface DisplayMessage {
  id: string;
  from: "customer" | "other";
  authorName: string;
  text: string;
  at: string;
}

function PatientMessages() {
  const { myConversation, clinic, me, patientSession } = useApp();
  const vertical = useTenantVertical(clinic);
  const localConversation = useServiceCustomerConversation({
    tenantId: clinic.id,
    verticalId: vertical.id,
    customerId: patientSession?.patientId ?? "",
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const messages: DisplayMessage[] = localConversation
    ? localConversation.messages.map((message) => ({
        id: message.id,
        from: message.from === "customer" ? "customer" : "other",
        authorName: message.authorName,
        text: message.text,
        at: message.at,
      }))
    : (myConversation?.messages ?? []).map((message) => ({
        id: message.id,
        from: message.from === "patient" ? "customer" : "other",
        authorName: message.authorName,
        text: message.text,
        at: message.at,
      }));

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const t = text.trim();
    if (!t || !patientSession || !me) return;

    setBusy(true);
    try {
      const receipt = await serviceConversationIngestRuntime.ingest({
        tenant: clinicToServiceTenant(clinic, vertical.id),
        vertical,
        customerName: me.name,
        messagingAdapter: new LocalWebChatAdapter(),
        message: {
          providerMessageId: `web_patient_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          tenantId: clinic.id,
          customerId: patientSession.patientId,
          channel: "web",
          text: t,
          receivedAt: new Date().toISOString(),
        },
      });

      if (!receipt.persisted || !receipt.conversation) {
        toast.error("訊息未送出", { description: receipt.errors[0] ?? "請稍後再試。" });
        return;
      }

      setText("");
      toast.success("訊息已送出", {
        description: receipt.frontdesk?.autoReplyReceipt?.ok
          ? "本地 Agent 已回覆，對話已同步。"
          : receipt.state === "waiting_human"
            ? "這則訊息已交由前台人工跟進。"
            : "對話已保存，前台會繼續跟進。",
      });
    } catch (error) {
      toast.error("訊息未送出", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PatientPage title="訊息" subtitle={`與 ${clinic.name} 前台聯絡 · 本地網頁對話`}>
      <div className="flex items-start gap-2 rounded-2xl bg-tertiary-container p-4 md-body-s text-on-tertiary-container">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          此訊息先經本地網頁對話跑通，用於預約與行政查詢，不需要
          WhatsApp；不作醫療建議。若你感到劇痛、大量出血或呼吸困難，請立即致電 999。
        </p>
      </div>

      <MdCard variant="outlined" className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Globe2 className="size-4 shrink-0 text-primary" />
            <p className="md-label-l text-on-surface">本地網頁對話</p>
          </div>
          {localConversation && (
            <MdChip tone={CONVERSATION_STATE[localConversation.state].tone}>
              {CONVERSATION_STATE[localConversation.state].label}
            </MdChip>
          )}
        </div>

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex flex-col", m.from === "customer" ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 md-body-m",
                m.from === "customer"
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container text-on-surface",
              )}
            >
              {m.from === "other" && m.authorName.includes("Agent") && (
                <Bot className="mr-1 inline size-3.5" />
              )}
              {m.text}
            </div>
            <span className="mt-1 md-label-m text-on-surface-variant">
              {m.from === "customer" ? "你" : m.authorName}・{fmtDateTime(m.at)}
            </span>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="py-6 text-center md-body-m text-on-surface-variant">
            未有訊息紀錄，你可以在下方發出第一則訊息。
          </p>
        )}
      </MdCard>

      <form
        className="sticky bottom-24 flex items-end gap-2 rounded-3xl bg-surface-container-high p-2 md:bottom-4"
        onSubmit={(event) => void send(event)}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="輸入訊息，例如想改期或查詢收據…"
          aria-label="輸入訊息"
          className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2 md-body-m text-on-surface outline-none placeholder:text-on-surface-variant"
        />
        <MdButton
          type="submit"
          disabled={busy || !patientSession}
          icon={<Send className="size-4" />}
        >
          發送
        </MdButton>
      </form>
    </PatientPage>
  );
}
