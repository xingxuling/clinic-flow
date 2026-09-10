import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Layers3,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { MdCard, MdChip } from "@/components/m3";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Scheduling｜Service Frontdesk" },
      {
        name: "description",
        content: "從客戶需求、Worker 匹配到 Hold 與 Confirm 的通用服務業智能排程工作台。",
      },
      { property: "og:title", content: "Smart Scheduling｜Service Frontdesk" },
      {
        property: "og:description",
        content: "同一套 AI 前台核心，透過 Vertical Pack 服務牙科、寵物、家居、美容、汽車等行業。",
      },
    ],
  }),
  component: EntryPage,
});

const verticals = ["牙科", "寵物照護", "家居／水電", "美容", "汽車維修"];

const workflow = [
  {
    step: "01",
    title: "收集服務需求",
    detail: "時間窗、服務時長、地點與必要能力先結構化。",
    icon: MessageSquareText,
    tone: "bg-secondary-container text-on-secondary-container",
  },
  {
    step: "02",
    title: "匹配可用 Worker",
    detail: "先過硬約束，再按距離、評分和偏好輸出可解釋候選。",
    icon: UsersRound,
    tone: "bg-tertiary-container text-on-tertiary-container",
  },
  {
    step: "03",
    title: "Hold 後確認",
    detail: "保留時段、再次檢查衝突，確認後才建立 Job 與通知。",
    icon: LockKeyhole,
    tone: "bg-primary-container text-on-primary-container",
  },
] as const;

const previewCandidates = [
  { id: "#A17", label: "匹配度 94%", time: "10:30", detail: "區域符合 · 可即時接單" },
  { id: "#B04", label: "匹配度 88%", time: "11:00", detail: "能力符合 · 需 15 分鐘移動" },
];

function EntryPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-surface-container-lowest text-on-surface">
      <header className="border-b border-outline-variant/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
              <Layers3 className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold tracking-tight text-on-surface">
                Service Frontdesk
              </span>
              <span className="block truncate md-body-s text-on-surface-variant">
                Core + Vertical Pack
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-6 md:flex">
            <span className="md-label-m text-on-surface-variant">REQUEST → MATCH → CONFIRM</span>
            <span className="h-5 w-px bg-outline-variant" aria-hidden />
            <span className="md-label-m text-on-surface-variant">Privacy Broker · Job scope</span>
          </div>

          <Link
            to="/staff/login"
            className="state-layer inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-primary px-4 md-label-l text-primary-foreground sm:px-5"
          >
            <span className="hidden sm:inline">進入工作台</span>
            <span className="sm:hidden">登入</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:items-center lg:gap-16 lg:px-8 lg:pb-20">
          <div>
            <MdChip tone="secondary" className="mb-5 h-7 rounded-full px-3">
              SMART SCHEDULING · PHASE 1
            </MdChip>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-on-surface sm:text-6xl">
              把客戶需求
              <br />
              <span className="text-primary">變成可確認的時段。</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-on-surface-variant sm:text-lg">
              Service Frontdesk 將客戶對話整理成 Service Request，按 Worker
              的能力、區域、可用時間和服務 buffers 找出候選，讓人工在最後一步確認。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/staff/login"
                className="state-layer inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 md-label-l text-primary-foreground"
              >
                <CalendarClock className="size-5" />
                開始智能排程
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/patient/login"
                className="state-layer inline-flex h-12 items-center gap-2 rounded-full border border-outline px-5 md-label-l text-primary"
              >
                客戶入口
                <ChevronRight className="size-4" />
              </Link>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="border-l-2 border-primary pl-3">
                <p className="md-label-m text-on-surface-variant">排程流程</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">Request → Confirm</p>
              </div>
              <div className="border-l-2 border-tertiary pl-3">
                <p className="md-label-m text-on-surface-variant">資料視圖</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">最小必要披露</p>
              </div>
              <div className="col-span-2 border-l-2 border-secondary pl-3 sm:col-span-1">
                <p className="md-label-m text-on-surface-variant">決策邊界</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">人工保留 Confirm</p>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
            <div
              className="absolute -right-16 -top-16 size-48 rounded-full bg-primary-container/60 blur-3xl"
              aria-hidden
            />
            <div
              className="absolute -bottom-12 -left-16 size-44 rounded-full bg-tertiary-container/60 blur-3xl"
              aria-hidden
            />

            <MdCard
              variant="elevated"
              className="relative overflow-hidden border border-outline-variant/70 bg-surface p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-3 border-b border-outline-variant/70 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                    <p className="md-label-l text-on-surface">Smart Scheduling</p>
                  </div>
                  <p className="mt-1 md-body-s text-on-surface-variant">
                    示意畫面 · 不含私人聯絡資料
                  </p>
                </div>
                <MdChip tone="tertiary">Privacy Broker</MdChip>
              </div>

              <div className="mt-4 rounded-2xl bg-secondary-container/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="md-label-m text-on-secondary-container/70">SERVICE REQUEST</p>
                    <p className="mt-1 md-title-m text-on-secondary-container">
                      上門服務 · 90 分鐘
                    </p>
                  </div>
                  <span className="rounded-full bg-surface/70 px-2 py-1 md-label-m text-on-secondary-container">
                    #SR-204
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-surface/70 px-2 py-1 md-label-m text-on-secondary-container">
                    <Clock3 className="size-3.5" /> 今日 09:30–12:00
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-surface/70 px-2 py-1 md-label-m text-on-secondary-container">
                    <MapPin className="size-3.5" /> 指定區域
                  </span>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div>
                  <p className="md-title-m text-on-surface">推薦候選</p>
                  <p className="mt-1 md-body-s text-on-surface-variant">硬約束通過後再排序</p>
                </div>
                <MdChip tone="primary">2 個可用</MdChip>
              </div>

              <div className="mt-3 space-y-2">
                {previewCandidates.map((candidate, index) => (
                  <div
                    key={candidate.id}
                    className="flex items-center gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-3"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest text-sm font-semibold text-on-surface">
                      {candidate.id.replace("#", "")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="md-title-m text-on-surface">Worker {candidate.id}</p>
                        {index === 0 && <MdChip tone="primary">首選</MdChip>}
                      </div>
                      <p className="mt-1 truncate md-body-s text-on-surface-variant">
                        {candidate.detail}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold text-primary">{candidate.time}</p>
                      <p className="md-label-m text-on-surface-variant">{candidate.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                    <Check className="size-4" />
                  </span>
                  <p className="truncate md-body-s text-on-surface-variant">
                    Hold 會先鎖定時段，再等待 Confirm
                  </p>
                </div>
                <span className="shrink-0 md-label-m text-primary">可追蹤</span>
              </div>
            </MdCard>

            <div className="relative -mt-3 ml-5 flex max-w-[calc(100%-2.5rem)] items-center gap-2 rounded-2xl border border-outline-variant/70 bg-surface-container-high px-4 py-3 md-elevation-1">
              <LockKeyhole className="size-4 shrink-0 text-primary" />
              <p className="md-body-s text-on-surface-variant">
                Customer 與 Worker 只在當前 Job 看到必要身份，不直接交換電話和地址。
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-outline-variant/70 bg-surface-container-low py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <p className="md-label-m text-on-surface-variant">ONE CORE · MANY VERTICAL PACKS</p>
              <p className="mt-1 md-title-m text-on-surface">
                同一套服務前台，按行業換上自己的語言與規則。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {verticals.map((vertical, index) => (
                <span
                  key={vertical}
                  className={`rounded-full px-3 py-2 md-label-m ${
                    index === 0
                      ? "bg-primary-container text-on-primary-container"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {vertical}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <MdChip tone="neutral">可解釋的服務流程</MdChip>
              <h2 className="mt-3 md-display-s text-on-surface">從需求到確認，每一步都有邊界。</h2>
            </div>
            <p className="max-w-sm md-body-m text-on-surface-variant">
              Agent 可以整理和提出候選，但不取代商戶的專業判斷與最後確認。
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {workflow.map((item) => {
              const Icon = item.icon;
              return (
                <MdCard key={item.step} variant="outlined" className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex size-11 items-center justify-center rounded-2xl ${item.tone}`}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="md-label-m text-on-surface-variant">{item.step}</span>
                  </div>
                  <h3 className="mt-6 md-title-l text-on-surface">{item.title}</h3>
                  <p className="mt-2 md-body-m text-on-surface-variant">{item.detail}</p>
                  <div className="mt-6 flex items-center gap-2 md-label-m text-primary">
                    <Sparkles className="size-3.5" /> 可追溯、可接管
                  </div>
                </MdCard>
              );
            })}
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-14 sm:px-6 lg:grid-cols-2 lg:px-8 lg:pb-20">
          <Link
            to="/staff/login"
            className="state-layer group rounded-3xl bg-primary-container p-6 text-on-primary-container sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <MdChip tone="primary">STAFF WORKSPACE</MdChip>
                <h2 className="mt-5 md-title-l">進入商戶工作台</h2>
                <p className="mt-2 max-w-md md-body-m opacity-80">
                  開啟智能排程、對話、Agent、匯入、跟進與行業設定。
                </p>
              </div>
              <ArrowRight className="mt-1 size-6 shrink-0 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-8 flex flex-wrap gap-2 md-label-m">
              <span className="rounded-full bg-surface/60 px-3 py-2">Worker Schedule</span>
              <span className="rounded-full bg-surface/60 px-3 py-2">Hold / Confirm</span>
              <span className="rounded-full bg-surface/60 px-3 py-2">Job Agent</span>
            </div>
          </Link>

          <Link
            to="/patient/login"
            className="state-layer group rounded-3xl border border-outline-variant bg-surface p-6 sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <MdChip tone="tertiary">CUSTOMER PORTAL</MdChip>
                <h2 className="mt-5 md-title-l">進入客戶入口</h2>
                <p className="mt-2 max-w-md md-body-m text-on-surface-variant">
                  牙科 Demo 的既有自助入口仍保留；通用 Customer Portal 按垂直行業逐步接入。
                </p>
              </div>
              <ChevronRight className="mt-1 size-6 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-8 flex items-center gap-2 md-label-m text-on-surface-variant">
              <ShieldCheck className="size-4 text-tertiary" /> 保留既有身份與人工接管邊界
            </div>
          </Link>
        </section>

        <footer className="border-t border-outline-variant/70 bg-surface-container-low">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <p className="md-body-s text-on-surface-variant">
                AI 只處理已授權的溝通、排程、提醒與資料整理；受限專業判斷與高風險事項轉人工。
              </p>
            </div>
            <p className="shrink-0 md-label-m text-on-surface-variant">Service Frontdesk · 2026</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
