import { createFileRoute } from "@tanstack/react-router";
import { Send, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { PatientPage } from "@/components/layout/PatientShell";
import { MdButton, MdCard } from "@/components/m3";
import { fmtDateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/patient/_app/messages")({
  head: () => ({
    meta: [
      { title: "與診所的訊息｜晴和牙科中心" },
      { name: "description", content: "與診所前台就預約及行政事宜溝通，不提供網上診症。" },
      { property: "og:title", content: "與診所的訊息｜晴和牙科中心" },
      { property: "og:description", content: "與診所前台就預約及行政事宜溝通。" },
    ],
  }),
  component: PatientMessages,
});

function PatientMessages() {
  const { myConversation, mySendMessage, clinic } = useApp();
  const [text, setText] = useState("");

  function send() {
    const t = text.trim();
    if (!t) return;
    mySendMessage(t);
    setText("");
  }

  return (
    <PatientPage title="訊息" subtitle={`與 ${clinic.name} 前台聯絡`}>
      <div className="flex items-start gap-2 rounded-2xl bg-tertiary-container p-4 md-body-s text-on-tertiary-container">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          此訊息只用於預約與行政查詢，不作醫療建議。若你感到劇痛、大量出血或呼吸困難，請立即致電 999。
        </p>
      </div>

      <MdCard variant="outlined" className="flex flex-col gap-3 p-4">
        {(myConversation?.messages ?? []).map((m) => (
          <div
            key={m.id}
            className={cn("flex flex-col", m.from === "patient" ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 md-body-m",
                m.from === "patient"
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container text-on-surface",
              )}
            >
              {m.text}
            </div>
            <span className="mt-1 md-label-m text-on-surface-variant">
              {m.from === "patient" ? "你" : m.authorName}・{fmtDateTime(m.at)}
            </span>
          </div>
        ))}
        {!myConversation && (
          <p className="py-6 text-center md-body-m text-on-surface-variant">
            未有訊息紀錄，你可以在下方發出第一則訊息。
          </p>
        )}
      </MdCard>

      <div className="sticky bottom-24 flex items-end gap-2 rounded-3xl bg-surface-container-high p-2 md:bottom-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="輸入訊息，例如想改期或查詢收據…"
          className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2 md-body-m text-on-surface outline-none placeholder:text-on-surface-variant"
        />
        <MdButton onClick={send} icon={<Send className="size-4" />}>
          發送
        </MdButton>
      </div>
    </PatientPage>
  );
}
