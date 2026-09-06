import { createFileRoute } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { PatientPage } from "@/components/layout/PatientShell";
import { MdButton, MdCard, MdSelect, MdTextField } from "@/components/m3";
import { CHANNEL } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { ChannelKind, Patient } from "@/types/domain";

export const Route = createFileRoute("/patient/_app/profile")({
  head: () => ({
    meta: [
      { title: "我的聯絡資料｜晴和牙科中心" },
      { name: "description", content: "更新聯絡電話與偏好聯絡方式，只保留行政所需的最低資料。" },
      { property: "og:title", content: "我的聯絡資料｜晴和牙科中心" },
      { property: "og:description", content: "更新聯絡電話與偏好聯絡方式。" },
    ],
  }),
  component: PatientProfile,
});

function PatientProfile() {
  const { me, myUpdateProfile, signOutPatient, patientSession, clinic } = useApp();
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [channel, setChannel] = useState<ChannelKind>(me?.preferredChannel ?? "whatsapp");
  const [lang, setLang] = useState<Patient["language"]>(me?.language ?? "zh-HK");

  const methodLabel =
    patientSession?.method === "otp"
      ? "手機一次性驗證碼"
      : patientSession?.method === "qr"
        ? "病人二維碼"
        : "診所專屬連結";

  return (
    <PatientPage title="我的資料" subtitle="只保留診所行政所需的最低資料">
      <MdCard variant="outlined" className="p-4">
        <p className="md-title-m text-on-surface">{me?.name}</p>
        <p className="md-body-s text-on-surface-variant">
          {clinic.name}・檔案編號 {me?.fileNo}
        </p>
      </MdCard>

      <MdCard variant="outlined" className="flex flex-col gap-4 p-4">
        <MdTextField label="聯絡電話" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <MdSelect
          label="偏好聯絡方式"
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChannelKind)}
        >
          {(["whatsapp", "phone", "web"] as ChannelKind[]).map((c) => (
            <option key={c} value={c}>
              {CHANNEL[c]}
            </option>
          ))}
        </MdSelect>
        <MdSelect
          label="語言"
          value={lang}
          onChange={(e) => setLang(e.target.value as Patient["language"])}
        >
          <option value="zh-HK">繁體中文（廣東話）</option>
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </MdSelect>
        <div>
          <MdButton
            onClick={() => myUpdateProfile({ phone, preferredChannel: channel, language: lang })}
          >
            儲存
          </MdButton>
        </div>
      </MdCard>

      <MdCard variant="outlined" className="p-4">
        <p className="flex items-center gap-1.5 md-title-m text-on-surface">
          <ShieldCheck className="size-4 text-primary" /> 私隱與登入
        </p>
        <ul className="mt-2 flex flex-col gap-1 md-body-s text-on-surface-variant">
          <li>・今次登入方式：{methodLabel}</li>
          <li>・你只能看到自己的預約、訊息與行政文件。</li>
          <li>・診所職員的內部工作台與你的空間完全分開。</li>
          <li>・所有示範資料均為虛構。</li>
        </ul>
        <div className="mt-4">
          <MdButton variant="outlined" icon={<LogOut className="size-4" />} onClick={signOutPatient}>
            登出
          </MdButton>
        </div>
      </MdCard>
    </PatientPage>
  );
}
