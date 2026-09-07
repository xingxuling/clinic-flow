import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fingerprint, KeyRound, Layers3, QrCode, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { MdButton, MdCard, MdChip, MdSegmented, MdTextField } from "@/components/m3";
import { DEMO_INVITE_CODES, useApp } from "@/state/app-store";

export const Route = createFileRoute("/staff/login")({
  head: () => ({
    meta: [
      { title: "商戶登入｜Service Frontdesk" },
      { name: "description", content: "邀請制 Service Frontdesk 後台，只限已獲邀請的商戶團隊成員登入。" },
      { property: "og:title", content: "商戶登入｜Service Frontdesk" },
      { property: "og:description", content: "邀請制服務業 AI 前台後台。" },
    ],
  }),
  component: SignInPage,
});

type Method = "code" | "qr" | "passkey";

function SignInPage() {
  const { signInStaff, staffSession, hydrated } = useApp();
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("code");
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (hydrated && staffSession) navigate({ to: "/staff/today" });
  }, [hydrated, staffSession, navigate]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = signInStaff({ code, method: "code" });
    if (ok) navigate({ to: "/staff/today" });
    else setError(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-low px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
            <Layers3 className="size-7" />
          </span>
          <div>
            <h1 className="md-headline-s text-on-surface">Service Frontdesk</h1>
            <p className="md-body-s text-on-surface-variant">商戶 AI 前台 · 邀請制後台</p>
          </div>
        </div>

        <MdCard variant="elevated" className="p-6">
          <MdSegmented<Method>
            value={method}
            onChange={setMethod}
            className="mb-5 w-full"
            options={[
              { value: "code", label: "密令" },
              { value: "qr", label: "二維碼" },
              { value: "passkey", label: "Passkey" },
            ]}
          />

          {method === "code" && (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <MdTextField
                label="邀請密令"
                placeholder="例如 CINGHE-2026"
                value={code}
                autoCapitalize="characters"
                onChange={(event) => {
                  setCode(event.target.value);
                  setError(false);
                }}
              />
              {error && <p className="md-body-s text-error">密令無效或已失效，請聯絡商戶負責人。</p>}
              <MdButton type="submit" icon={<KeyRound className="size-4" />}>進入工作台</MdButton>
              <div className="rounded-lg bg-surface-container p-3 md-body-s text-on-surface-variant">
                Dental Demo 密令：
                {DEMO_INVITE_CODES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setCode(value);
                      setError(false);
                    }}
                    className="ml-2 underline underline-offset-2"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </form>
          )}

          {method === "qr" && (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="grid size-40 place-items-center rounded-2xl border border-outline-variant bg-surface-container">
                <QrCode className="size-20 text-on-surface-variant" />
              </div>
              <p className="md-body-m text-on-surface-variant">
                由商戶負責人在「員工與權限」產生邀請二維碼，新同事掃描後綁定裝置。
              </p>
              <MdChip tone="tertiary">Demo · 尚未接真實掃描器</MdChip>
              <MdButton
                variant="tonal"
                onClick={() => {
                  signInStaff({ code: "", method: "qr" });
                  navigate({ to: "/staff/today" });
                }}
              >
                以示範帳號模擬掃描
              </MdButton>
            </div>
          )}

          {method === "passkey" && (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <Fingerprint className="size-16 text-primary" />
              <p className="md-body-m text-on-surface-variant">
                正式版以 WebAuthn / Passkey 綁定前台平板或個人手機；裝置遺失可由商戶負責人解除。
              </p>
              <MdChip tone="tertiary">Demo 佔位</MdChip>
              <MdButton
                variant="tonal"
                onClick={() => {
                  signInStaff({ code: "", method: "passkey" });
                  navigate({ to: "/staff/today" });
                }}
              >
                以示範帳號模擬 Passkey
              </MdButton>
            </div>
          )}
        </MdCard>

        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-surface-container p-4 md-body-s text-on-surface-variant">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Service Frontdesk 只處理已授權的客戶溝通、排程、提醒、資料整理與跟進流程；受限專業判斷與高風險事項轉人工。
          </p>
        </div>
      </div>
    </div>
  );
}
