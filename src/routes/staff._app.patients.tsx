import { createFileRoute } from "@tanstack/react-router";
import { Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/AppShell";
import { EmptyState, MdCard, MdChip, MdTextField, SectionHeader } from "@/components/m3";
import { CHANNEL, fmtDate } from "@/lib/labels";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/app/patients")({
  head: () => ({
    meta: [
      { title: "病人目錄｜診所行政 Agent" },
      { name: "description", content: "只顯示行政最低必要資料，不展示臨床病歷內容。" },
    ],
  }),
  component: PatientsPage,
});

function maskPhone(phone: string, mask: boolean) {
  if (!mask) return phone;
  return phone.replace(/(\d{4})\s?(\d{4})$/, "$1 ••••");
}

function PatientsPage() {
  const { patients, clinic, appointments } = useApp();
  const [q, setQ] = useState("");
  const mask = clinic.settings.privacy.maskPhoneInLists;

  const list = patients.filter(
    (p) => p.name.includes(q) || p.fileNo.toLowerCase().includes(q.toLowerCase()) || q === "",
  );

  return (
    <PageContainer title="病人目錄" subtitle="行政最低必要資料原則：只保留聯絡與排程所需資訊。">
      <MdCard className="mb-5 flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="md-body-m text-on-surface-variant">
          此頁不顯示診斷、用藥、影像或臨床記錄。
          {mask ? "列表電話號碼已按隱私設定遮蔽部分數字。" : "列表顯示完整電話號碼。"}
        </p>
      </MdCard>

      <MdTextField
        label=""
        placeholder="搜尋姓名或檔案編號"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <SectionHeader title="病人" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text="沒有符合的病人。" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const upcoming = appointments.filter(
              (a) => a.patientId === p.id && new Date(a.startAt) > new Date() && a.status !== "cancelled",
            );
            return (
              <MdCard key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="md-title-m truncate text-on-surface">{p.name}</p>
                    <p className="md-body-s text-on-surface-variant">檔案 {p.fileNo}</p>
                  </div>
                  <MdChip tone="secondary">{CHANNEL[p.preferredChannel]}</MdChip>
                </div>
                <p className="mt-3 md-body-m text-on-surface">{maskPhone(p.phone, mask)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <MdChip key={t} tone="primary">
                      {t}
                    </MdChip>
                  ))}
                </div>
                <dl className="mt-3 space-y-1 md-body-s text-on-surface-variant">
                  <div>上次到診：{p.lastVisitAt ? fmtDate(p.lastVisitAt) : "—"}</div>
                  <div>下次召回：{p.nextRecallAt ? fmtDate(p.nextRecallAt) : "—"}</div>
                  <div>未來預約：{upcoming.length} 宗</div>
                  <div>行政備註：{p.notesAdmin || "—"}</div>
                </dl>
              </MdCard>
            );
          })}
        </div>
      )}
      <p className="mt-6 flex items-center gap-2 md-body-s text-on-surface-variant">
        <Search className="size-4" /> 全部資料均為虛構示範資料。
      </p>
    </PageContainer>
  );
}
