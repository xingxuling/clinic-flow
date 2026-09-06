import { createFileRoute } from "@tanstack/react-router";
import { Plug, X } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/AppShell";
import { MdButton, MdCard, MdChip, MdSwitch, MdTextField, SectionHeader } from "@/components/m3";
import { CHANNEL } from "@/lib/labels";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "診所設定｜診所行政 Agent" },
      { name: "description", content: "營業時間、服務類型、提醒規則、緊急關鍵詞、渠道連接與隱私設定。" },
    ],
  }),
  component: SettingsPage,
});

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function SettingsPage() {
  const { clinic, updateClinicSettings } = useApp();
  const [keyword, setKeyword] = useState("");

  const s = clinic.settings;

  const setSettings = (patch: Partial<typeof s>) =>
    updateClinicSettings({ settings: { ...s, ...patch } });

  return (
    <PageContainer title="診所設定" subtitle={`${clinic.name}・${clinic.district}`}>
      <div className="grid gap-4 xl:grid-cols-2">
        <MdCard className="p-5">
          <SectionHeader title="營業時間" />
          <div className="space-y-2">
            {clinic.businessHours.map((h) => (
              <div key={h.weekday} className="flex items-center gap-3 md-body-m">
                <span className="w-10 text-on-surface-variant">週{WEEKDAYS[h.weekday]}</span>
                {h.closed ? (
                  <MdChip tone="neutral">休息</MdChip>
                ) : (
                  <span className="text-on-surface">
                    {h.open} – {h.close}
                  </span>
                )}
              </div>
            ))}
          </div>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="服務類型" count={clinic.services.length} />
          <div className="flex flex-wrap gap-2">
            {clinic.services.map((svc) => (
              <MdChip key={svc.id} tone="secondary">
                {svc.name}・{svc.durationMin} 分鐘
              </MdChip>
            ))}
          </div>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="提醒規則" />
          <p className="md-body-m text-on-surface-variant">
            就診前提醒：{s.reminderLeadHours.join(" / ")} 小時
          </p>
          <p className="mt-1 md-body-m text-on-surface-variant">
            定期召回：{s.recallMonths.join(" / ")} 個月
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[24, 48, 72].map((h) => (
              <MdButton
                key={h}
                size="sm"
                variant={s.reminderLeadHours.includes(h) ? "tonal" : "outlined"}
                onClick={() =>
                  setSettings({
                    reminderLeadHours: s.reminderLeadHours.includes(h)
                      ? s.reminderLeadHours.filter((x) => x !== h)
                      : [...s.reminderLeadHours, h].sort((a, b) => b - a),
                  })
                }
              >
                {h} 小時
              </MdButton>
            ))}
          </div>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="緊急關鍵詞" count={s.urgentKeywords.length} />
          <p className="mb-3 md-body-s text-on-surface-variant">
            只用於標記可能需要優先處理的訊息，不會產生任何醫學判斷。
          </p>
          <div className="flex flex-wrap gap-2">
            {s.urgentKeywords.map((k) => (
              <MdChip key={k} tone="error">
                {k}
                <button
                  aria-label={`移除 ${k}`}
                  onClick={() => setSettings({ urgentKeywords: s.urgentKeywords.filter((x) => x !== k) })}
                >
                  <X className="size-3" />
                </button>
              </MdChip>
            ))}
          </div>
          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!keyword.trim()) return;
              setSettings({ urgentKeywords: [...s.urgentKeywords, keyword.trim()] });
              setKeyword("");
            }}
          >
            <MdTextField
              label="新增關鍵詞"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="flex-1"
            />
            <MdButton type="submit" variant="tonal">
              新增
            </MdButton>
          </form>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="渠道連接" />
          <div className="space-y-3">
            {s.channels.map((c) => (
              <div key={c.channel} className="flex items-center gap-3">
                <Plug className="size-4 text-on-surface-variant" />
                <div className="flex-1">
                  <p className="md-body-m text-on-surface">{CHANNEL[c.channel]}</p>
                  <p className="md-body-s text-on-surface-variant">{c.note}</p>
                </div>
                <MdChip tone={c.connected ? "primary" : "neutral"}>
                  {c.connected ? "模擬已連接" : "未連接"}
                </MdChip>
              </div>
            ))}
          </div>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="隱私設定" />
          <MdSwitch
            label="列表遮蔽電話號碼"
            checked={s.privacy.maskPhoneInLists}
            onCheckedChange={(v) => setSettings({ privacy: { ...s.privacy, maskPhoneInLists: v } })}
          />
          <MdSwitch
            label="允許儲存臨床備註（不建議）"
            checked={s.privacy.storeMedicalNotes}
            onCheckedChange={(v) => setSettings({ privacy: { ...s.privacy, storeMedicalNotes: v } })}
          />
          <p className="mt-3 md-body-s text-on-surface-variant">
            行政資料保留期：{s.privacy.retentionDays} 日。本系統定位為行政工具，預設不儲存臨床病歷。
          </p>
        </MdCard>
      </div>
    </PageContainer>
  );
}
