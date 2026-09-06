import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, ShieldCheck, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "晴和牙科中心｜私人服務入口" },
      {
        name: "description",
        content: "診所私人服務入口：病人管理自己的預約，職員進入行政後台。不設公開註冊。",
      },
      { property: "og:title", content: "晴和牙科中心｜私人服務入口" },
      {
        property: "og:description",
        content: "診所私人服務入口：病人管理自己的預約，職員進入行政後台。",
      },
    ],
  }),
  component: EntryPage,
});

function EntryPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-low px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
            <Stethoscope className="size-7" />
          </span>
          <div>
            <h1 className="md-headline-s text-on-surface">晴和牙科中心</h1>
            <p className="md-body-s text-on-surface-variant">私人服務入口・不設公開註冊</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to="/patient/login"
            className="state-layer flex items-center gap-4 rounded-3xl bg-tertiary-container p-5 text-on-tertiary-container"
          >
            <CalendarCheck className="size-7 shrink-0" />
            <span className="flex-1">
              <span className="block md-title-m">我是病人／管理我的預約</span>
              <span className="block md-body-s opacity-80">查看下次應診、確認、改期、上載資料</span>
            </span>
          </Link>

          <Link
            to="/staff/login"
            className="state-layer flex items-center gap-4 rounded-3xl bg-secondary-container p-5 text-on-secondary-container"
          >
            <ShieldCheck className="size-7 shrink-0" />
            <span className="flex-1">
              <span className="block md-title-m">我是診所職員／進入行政後台</span>
              <span className="block md-body-s opacity-80">邀請密令、員工二維碼或 Passkey</span>
            </span>
          </Link>
        </div>

        <p className="mt-8 md-body-s text-on-surface-variant">
          本系統只處理診所行政資料，不作醫學診斷。示範版所有資料均為虛構。
        </p>
      </div>
    </div>
  );
}
