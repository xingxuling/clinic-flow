import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, CalendarCheck, Layers3, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Service Frontdesk｜服務業 AI 前台" },
      {
        name: "description",
        content: "通用服務業 AI 前台：客戶對話、排程、提醒、舊資料匯入、跟進與行業包。",
      },
      { property: "og:title", content: "Service Frontdesk｜服務業 AI 前台" },
      {
        property: "og:description",
        content: "同一套 AI 前台核心，透過 Vertical Pack 服務牙科、寵物、家居、美容、汽車等行業。",
      },
    ],
  }),
  component: EntryPage,
});

function EntryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-low px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
            <Layers3 className="size-7" />
          </span>
          <div>
            <h1 className="md-headline-s text-on-surface">Service Frontdesk</h1>
            <p className="md-body-s text-on-surface-variant">通用服務業 AI 前台 · Core + Vertical Pack</p>
          </div>
        </div>

        <div className="mb-5 grid gap-2 sm:grid-cols-5">
          {["牙科", "寵物", "家居／水電", "美容", "汽車維修"].map((label) => (
            <div key={label} className="rounded-2xl bg-surface-container px-3 py-3 text-center md-label-m text-on-surface-variant">
              {label}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to="/staff/login"
            className="state-layer flex items-center gap-4 rounded-3xl bg-secondary-container p-5 text-on-secondary-container"
          >
            <ShieldCheck className="size-7 shrink-0" />
            <span className="flex-1">
              <span className="block md-title-m">商戶員工／進入 AI 前台</span>
              <span className="block md-body-s opacity-80">對話、排程、Agent、拍照匯入、跟進召回與行業設定</span>
            </span>
            <Bot className="size-5 opacity-70" />
          </Link>

          <Link
            to="/patient/login"
            className="state-layer flex items-center gap-4 rounded-3xl border border-outline-variant bg-surface p-5 text-on-surface"
          >
            <CalendarCheck className="size-7 shrink-0 text-tertiary" />
            <span className="flex-1">
              <span className="block md-title-m">Dental Demo：病人自助入口</span>
              <span className="block md-body-s text-on-surface-variant">
                舊牙科 Customer Portal 兼容層；通用 Customer Portal 尚未宣稱完成
              </span>
            </span>
          </Link>
        </div>

        <div className="mt-8 rounded-2xl bg-surface-container p-4 md-body-s text-on-surface-variant">
          <p className="font-medium text-on-surface">平台邊界</p>
          <p className="mt-1">
            AI 只處理已授權的客戶溝通、排程、提醒、資料整理與跟進流程；受限專業判斷、高風險事項與不確定資料轉人工。
          </p>
        </div>
      </div>
    </div>
  );
}
