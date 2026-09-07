import { createFileRoute } from "@tanstack/react-router";
import { Plug, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import { MdButton, MdCard, MdChip, MdSwitch, MdTextField, SectionHeader } from "@/components/m3";
import { VerticalSwitcher } from "@/components/verticals/VerticalSwitcher";
import { CHANNEL } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import { safetyBoundaryText, safetyFlagLabel } from "@/verticals/presentation";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/settings")({
  head: () => ({
    meta: [
      { title: "設定｜Service Frontdesk" },
      { name: "description", content: "商戶、行業、服務、提醒、安全、渠道、整合與隱私設定。" },
    ],
  }),
  component: SettingsPage,
});

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function SettingsPage() {
  const { clinic, updateClinicSettings } = useApp();
  const vertical = useTenantVertical(clinic);
  const [keyword, setKeyword] = useState("");

  const settings = clinic.settings;
  const setSettings = (patch: Partial<typeof settings>) =>
    updateClinicSettings({ settings: { ...settings, ...patch } });

  return (
    <PageContainer title="設定" subtitle={`${clinic.name} · ${vertical.displayName} · ${clinic.district}`}>
      <VerticalSwitcher tenantId={clinic.id} vertical={vertical} />

      <div className="grid gap-4 xl:grid-cols-2">
        <MdCard className="p-5">
          <SectionHeader title={`${vertical.labels.venue}營業 / 服務時間`} />
          <div className="space-y-2">
            {clinic.businessHours.map((hour) => (
              <div key={hour.weekday} className="flex items-center gap-3 md-body-m">
                <span className="w-10 text-on-surface-variant">週{WEEKDAYS[hour.weekday]}</span>
                {hour.closed ? (
                  <MdChip tone="neutral">休息</MdChip>
                ) : (
                  <span className="text-on-surface">{hour.open} – {hour.close}</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 md-body-s text-on-surface-variant">
            不同行業可再擴充成上門服務區間、工位容量、寄養容量等排程條件。
          </p>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="服務" count={vertical.services.length} />
          <div className="flex flex-wrap gap-2">
            {vertical.services.map((service) => (
              <MdChip key={service.id} tone={service.requiresHumanConfirmation ? "tertiary" : "secondary"}>
                {service.name}
                {service.durationMin ? ` · ${service.durationMin} 分鐘` : ""}
                {service.requiresQuote ? " · 需報價" : ""}
              </MdChip>
            ))}
          </div>
          <p className="mt-3 md-body-s text-on-surface-variant">
            服務清單由目前行業設定提供；切換行業後會顯示對應服務與規則。
          </p>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="排程提醒" />
          <p className="md-body-m text-on-surface-variant">
            提前提醒：{settings.reminderLeadHours.join(" / ")} 小時
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[24, 48, 72].map((hours) => (
              <MdButton
                key={hours}
                size="sm"
                variant={settings.reminderLeadHours.includes(hours) ? "tonal" : "outlined"}
                onClick={() =>
                  setSettings({
                    reminderLeadHours: settings.reminderLeadHours.includes(hours)
                      ? settings.reminderLeadHours.filter((value) => value !== hours)
                      : [...settings.reminderLeadHours, hours].sort((a, b) => b - a),
                  })
                }
              >
                {hours} 小時
              </MdButton>
            ))}
          </div>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="服務後跟進" count={vertical.followUpRules.length} />
          {vertical.followUpRules.length === 0 ? (
            <p className="md-body-m text-on-surface-variant">目前沒有設定自動跟進週期。</p>
          ) : (
            <div className="space-y-3">
              {vertical.followUpRules.map((rule) => (
                <div key={rule.id} className="rounded-xl bg-surface-container p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="md-label-l text-on-surface">{rule.label}</p>
                    <MdChip tone="primary">
                      {rule.afterDays !== undefined ? `${rule.afterDays} 日` : rule.afterMonths !== undefined ? `${rule.afterMonths} 個月` : rule.trigger}
                    </MdChip>
                  </div>
                  <p className="mt-1 md-body-s text-on-surface-variant">{rule.customerMessage}</p>
                </div>
              ))}
            </div>
          )}
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title={safetyFlagLabel(vertical)} count={vertical.escalationKeywords.length} />
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-error-container/35 p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-error" />
            <p className="md-body-s text-on-surface-variant">{safetyBoundaryText(vertical)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {vertical.escalationKeywords.map((value) => (
              <MdChip key={value} tone="error">{value}</MdChip>
            ))}
          </div>

          {vertical.id === "dental" && (
            <>
              <p className="mb-2 mt-4 md-label-l text-on-surface">商戶追加關鍵詞</p>
              <div className="flex flex-wrap gap-2">
                {settings.urgentKeywords.map((value) => (
                  <MdChip key={value} tone="tertiary">
                    {value}
                    <button
                      aria-label={`移除 ${value}`}
                      onClick={() => setSettings({ urgentKeywords: settings.urgentKeywords.filter((item) => item !== value) })}
                    >
                      <X className="size-3" />
                    </button>
                  </MdChip>
                ))}
              </div>
              <form
                className="mt-3 flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!keyword.trim()) return;
                  setSettings({ urgentKeywords: [...settings.urgentKeywords, keyword.trim()] });
                  setKeyword("");
                }}
              >
                <MdTextField label="新增關鍵詞" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="flex-1" />
                <MdButton type="submit" variant="tonal">新增</MdButton>
              </form>
            </>
          )}
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="外部整合" count={vertical.integrationTargets.length} />
          {vertical.integrationTargets.length === 0 ? (
            <p className="md-body-m text-on-surface-variant">
              此行業暫無已驗證的專用系統整合；可先使用通用排程、日曆與消息連接。
            </p>
          ) : (
            <div className="space-y-3">
              {vertical.integrationTargets.map((target) => (
                <div key={target.id} className="flex items-start gap-3 rounded-xl bg-surface-container p-3">
                  <Plug className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="md-label-l text-on-surface">{target.displayName}</p>
                      <MdChip tone={target.status === "verified" ? "primary" : "neutral"}>
                        {target.status === "verified" ? "已驗證" : "候選"}
                      </MdChip>
                    </div>
                    <p className="mt-1 md-body-s text-on-surface-variant">{target.noteZhHk}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="渠道" />
          <div className="space-y-3">
            {settings.channels.map((channel) => (
              <div key={channel.channel} className="flex items-center gap-3">
                <Plug className="size-4 text-on-surface-variant" />
                <div className="flex-1">
                  <p className="md-body-m text-on-surface">{CHANNEL[channel.channel]}</p>
                  <p className="md-body-s text-on-surface-variant">{channel.note}</p>
                </div>
                <MdChip tone={channel.connected ? "primary" : "neutral"}>
                  {channel.connected ? "模擬已連接" : "未連接"}
                </MdChip>
              </div>
            ))}
          </div>
        </MdCard>

        <MdCard className="p-5">
          <SectionHeader title="資料與隱私" />
          <MdSwitch
            label="列表遮蔽電話號碼"
            checked={settings.privacy.maskPhoneInLists}
            onCheckedChange={(value) => setSettings({ privacy: { ...settings.privacy, maskPhoneInLists: value } })}
          />
          {(vertical.id === "dental" || vertical.id === "regulated-health") && (
            <MdSwitch
              label="允許儲存臨床備註（不建議）"
              checked={settings.privacy.storeMedicalNotes}
              onCheckedChange={(value) => setSettings({ privacy: { ...settings.privacy, storeMedicalNotes: value } })}
            />
          )}
          <p className="mt-3 md-body-s text-on-surface-variant">
            行政／客戶資料保留期：{settings.privacy.retentionDays} 日。只應保留完成溝通、排程與跟進所需資料。
          </p>
        </MdCard>
      </div>
    </PageContainer>
  );
}
