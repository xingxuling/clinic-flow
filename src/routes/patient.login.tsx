import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LinkIcon, QrCode, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { MdButton, MdCard, MdChip, MdSegmented, MdTextField } from "@/components/m3";
import { DEMO_PATIENT_OTP, useApp } from "@/state/app-store";

export const Route = createFileRoute("/patient/login")({
  head: () => ({
    meta: [
      { title: "進入我的診所空間｜晴和牙科中心" },
      { name: "description", content: "以診所發出的專屬連結、二維碼或手機驗證碼進入自己的預約空間。" },
      { property: "og:title", content: "進入我的診所空間｜晴和牙科中心" },
      { property: "og:description", content: "以專屬連結、二維碼或手機驗證碼進入自己的預約空間。" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { p?: string } => {
    const p = search["p"];
    return typeof p === "string" && p.length > 0 ? { p } : {};
  },
  component: PatientLogin,
});

type Method = "link" | "qr" | "otp";

function PatientLogin() {
  const { signInPatient, patientSession, hydrated } = useApp();
  const { p: requestedPatientId } = Route.useSearch();
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>("link");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hydrated && patientSession) navigate({ to: "/patient/home" });
  }, [hydrated, patientSession, navigate]);

  function enter(m: Method) {
    // 專屬連結的 ?p= 只有在診所曾發出該連結時才有效（示範白名單，取代真實簽名 token）。
    const ok = signInPatient({ patientId: requestedPatientId, method: m });
    if (!ok) {
      setError("此連結無效或已失效，請向診所索取新的專屬連結。");
      return;
    }
    navigate({ to: "/patient/home" });
  }


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-5 inline-flex items-center gap-1 md-label-l text-on-surface-variant">
          <ArrowLeft className="size-4" /> 返回入口
        </Link>

        <h1 className="md-headline-s text-on-surface">進入我的診所空間</h1>
        <p className="mt-1 mb-5 md-body-m text-on-surface-variant">
          晴和牙科中心・只顯示你自己的預約與資料
        </p>

        <MdCard variant="elevated" className="p-6">
          <MdSegmented<Method>
            value={method}
            onChange={(v) => {
              setMethod(v);
              setError("");
            }}
            className="mb-5 w-full"
            options={[
              { value: "link", label: "專屬連結" },
              { value: "qr", label: "二維碼" },
              { value: "otp", label: "手機驗證" },
            ]}
          />

          {method === "link" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <LinkIcon className="size-12 text-primary" />
              <p className="md-body-m text-on-surface-variant">
                診所會在預約確認訊息中，向你發出一條專屬連結。示範版可直接以虛構病人「陳曉晴」進入。
              </p>
              <MdButton onClick={() => enter("link")}>以示範連結進入</MdButton>
            </div>
          )}

          {method === "qr" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="grid size-40 place-items-center rounded-2xl border border-outline-variant bg-surface-container">
                <QrCode className="size-20 text-on-surface-variant" />
              </div>
              <p className="md-body-m text-on-surface-variant">
                到診時可掃描診所提供的個人二維碼。示範版以按鈕模擬掃描。
              </p>
              <MdChip tone="tertiary">佔位功能</MdChip>
              <MdButton variant="tonal" onClick={() => enter("qr")}>
                模擬掃描進入
              </MdButton>
            </div>
          )}

          {method === "otp" && (
            <div className="flex flex-col gap-4">
              <MdTextField
                label="手機號碼"
                placeholder="例如 9123 4407"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {!sent ? (
                <MdButton
                  icon={<Smartphone className="size-4" />}
                  onClick={() => {
                    setSent(true);
                    setError("");
                  }}
                >
                  發送一次性驗證碼
                </MdButton>
              ) : (
                <>
                  <MdTextField
                    label="一次性驗證碼"
                    placeholder="6 位數字"
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value);
                      setError("");
                    }}
                  />
                  {error && <p className="md-body-s text-error">{error}</p>}
                  <MdButton
                    onClick={() => {
                      if (otp.trim() === DEMO_PATIENT_OTP) enter("otp");
                      else setError("驗證碼不正確，請重試。");
                    }}
                  >
                    驗證並進入
                  </MdButton>
                  <p className="rounded-lg bg-surface-container p-3 md-body-s text-on-surface-variant">
                    示範驗證碼：
                    <button
                      type="button"
                      className="ml-1 underline underline-offset-2"
                      onClick={() => setOtp(DEMO_PATIENT_OTP)}
                    >
                      {DEMO_PATIENT_OTP}
                    </button>
                  </p>
                </>
              )}
            </div>
          )}
        </MdCard>

        <p className="mt-5 md-body-s text-on-surface-variant">
          本空間不設公開註冊，亦不提供網上診症。如情況緊急，請致電 999 或前往就近急症室。
        </p>
      </div>
    </div>
  );
}
