import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fingerprint, KeyRound, QrCode, ShieldCheck, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";

import { MdButton, MdCard, MdChip, MdSegmented, MdTextField } from "@/components/m3";
import { DEMO_INVITE_CODES, useApp } from "@/state/app-store";

export const Route = createFileRoute("/staff/login")({
  head: () => ({
    meta: [
      { title: "邀請登入｜診所行政 Agent" },
      { name: "description", content: "邀請制行政後台，僅限已獲邀請的診所團隊成員登入。" },
      { property: "og:title", content: "邀請登入｜診所行政 Agent" },
      { property: "og:description", content: "邀請制行政後台，僅限已獲邀請的診所團隊成員登入。" },
    ],
  }),
  component: SignInPage,
});

type Method = "code" | "qr" | "passkey";

function SignInPage() {
  const { signIn, session, hydrated } = useApp();
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("code");
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (hydrated && session) navigate({ to: "/staff/today" });
  }, [hydrated, session, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = signIn({ code, method: "code" });
    if (ok) navigate({ to: "/staff/today" });
    else setError(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-low px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
            <Stethoscope className="size-7" />
          </span>
          <div>
            <h1 className="md-headline-s text-on-surface">診所行政 Agent</h1>
            <p className="md-body-s text-on-surface-variant">邀請制後台・不設公開註冊</p>
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
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(false);
                }}
              />
              {error && (
                <p className="md-body-s text-error">密令無效或已失效，請聯絡診所負責人。</p>
              )}
              <MdButton type="submit" icon={<KeyRound className="size-4" />}>
                進入工作台
              </MdButton>
              <div className="rounded-lg bg-surface-container p-3 md-body-s text-on-surface-variant">
                示範密令：
                {DEMO_INVITE_CODES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCode(c);
                      setError(false);
                    }}
                    className="ml-2 underline underline-offset-2"
                  >
                    {c}
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
                由負責人在「員工與權限」產生邀請二維碼，新同事掃描後即可綁定此裝置。
              </p>
              <MdChip tone="tertiary">佔位功能・示範版未接掃描器</MdChip>
              <MdButton
                variant="tonal"
                onClick={() => {
                  signIn({ code: "", method: "qr" });
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
                Passkey／裝置綁定為佔位設計：正式版會以 WebAuthn 綁定前台 iPad 或個人手機，
                裝置遺失可由負責人即時解除。
              </p>
              <MdChip tone="tertiary">佔位功能</MdChip>
              <MdButton
                variant="tonal"
                onClick={() => {
                  signIn({ code: "", method: "passkey" });
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
            本系統只處理診所行政資料，不作醫學診斷、不代替臨床判斷。示範版所有資料均為虛構，
            不連接任何真實醫療、保險或通訊服務。
          </p>
        </div>
      </div>
    </div>
  );
}
