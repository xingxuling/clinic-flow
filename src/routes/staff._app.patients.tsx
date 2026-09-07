import { createFileRoute } from "@tanstack/react-router";
import { Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useServiceBookings } from "@/bookings/use-service-bookings";
import { LegacyImportPanel } from "@/components/importing/LegacyImportPanel";
import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, MdTextField, SectionHeader } from "@/components/m3";
import { VerticalSwitcher } from "@/components/verticals/VerticalSwitcher";
import { patientToServiceCustomer } from "@/customers/types";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { CHANNEL, fmtDate } from "@/lib/labels";
import { useMessagingControls } from "@/messaging/use-messaging-controls";
import { useApp } from "@/state/app-store";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/patients")({
  head: () => ({
    meta: [
      { title: "客戶｜Service Frontdesk" },
      { name: "description", content: "通用服務業客戶、服務對象、舊資料匯入與跟進資料。" },
    ],
  }),
  component: CustomersPage,
});

function maskPhone(phone: string, mask: boolean) {
  if (!mask) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `${digits.slice(0, Math.min(4, digits.length))} ••••`;
}

function consentLabel(state: string): string {
  return {
    unknown: "未記錄 WhatsApp 同意",
    opted_in: "已記錄 WhatsApp 同意",
    opted_out: "已退訂 WhatsApp",
  }[state] ?? state;
}

function CustomersPage() {
  const {
    patients,
    clinic,
    currentStaff,
    appointments,
    setAppointmentStatus,
    rescheduleAppointment,
    createAppointment,
  } = useApp();
  const vertical = useTenantVertical(clinic);
  const messaging = useMessagingControls(clinic.id, vertical.id);
  const { customers } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const { bookings } = useServiceBookings({
    clinic,
    vertical,
    legacyAppointments: appointments,
    legacyActions: {
      setStatus: setAppointmentStatus,
      reschedule: rescheduleAppointment,
      create: createAppointment,
    },
  });
  const [q, setQ] = useState("");
  const mask = clinic.settings.privacy.maskPhoneInLists;

  const legacyCustomers = useMemo(
    () => (vertical.id === "dental" ? patients.map(patientToServiceCustomer) : []),
    [patients, vertical.id],
  );
  const legacyById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const list = customers.filter((customer) => {
    const query = q.trim().toLocaleLowerCase();
    if (!query) return true;
    return (
      customer.displayName.toLocaleLowerCase().includes(query) ||
      customer.phone.includes(query) ||
      customer.tags.some((tag) => tag.toLocaleLowerCase().includes(query))
    );
  });

  return (
    <PageContainer
      title="客戶"
      subtitle={`${vertical.displayName} · ${vertical.labels.customer} · ${vertical.labels.subject} · 聯絡、跟進與資料匯入`}
    >
      <VerticalSwitcher tenantId={clinic.id} vertical={vertical} />

      <LegacyImportPanel
        key={vertical.id}
        tenantId={clinic.id}
        vertical={vertical}
        existingCustomers={legacyCustomers}
      />

      <MdCard className="mb-5 flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="md-body-m text-on-surface-variant">
          <p>只保存完成聯絡、排程與跟進所需的資料；需要專業判斷的內容交由人工處理。</p>
          <p className="mt-1">
            客戶可隨時要求停止 Agent 或退出 WhatsApp 主動訊息；這些狀態會持久保存並在所有自動發送前強制檢查。
          </p>
          <p className="mt-1 md-body-s">
            「記錄同意」只可在已取得客戶真實 opt-in 後使用；正式環境還應保存同意來源／證據，不把後台勾選本身當成同意。
          </p>
          <p className="mt-1">
            {mask ? "列表電話號碼已按隱私設定遮蔽部分數字。" : "列表顯示完整電話號碼。"}
          </p>
        </div>
      </MdCard>

      <MdTextField
        label=""
        placeholder={`搜尋${vertical.labels.customer}、電話或標籤`}
        value={q}
        onChange={(event) => setQ(event.target.value)}
        className="mb-4 max-w-sm"
      />

      <SectionHeader title="客戶列表" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text={`目前沒有符合條件的${vertical.labels.customer}。`} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((customer) => {
            const legacy = customer.verticalId === "dental" ? legacyById.get(customer.id) : undefined;
            const upcoming = bookings.filter(
              (booking) =>
                booking.customerId === customer.id &&
                new Date(booking.startAt) > new Date() &&
                booking.status !== "cancelled",
            );
            const control = messaging.getCustomer(customer.id);
            const utilityAllowed = control.whatsappConsentScopes.includes("utility");
            const marketingAllowed = control.whatsappConsentScopes.includes("marketing");

            return (
              <MdCard key={customer.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="md-title-m truncate text-on-surface">{customer.displayName}</p>
                    <p className="md-body-s text-on-surface-variant">
                      {legacy
                        ? `既有牙科檔案 ${legacy.fileNo}`
                        : customer.source === "legacy_import"
                          ? "拍照 / 文件匯入"
                          : "客戶資料"}
                    </p>
                  </div>
                  <MdChip tone="secondary">{CHANNEL[customer.preferredChannel]}</MdChip>
                </div>

                <p className="mt-3 md-body-m text-on-surface">{maskPhone(customer.phone, mask)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {customer.tags.map((tag) => (
                    <MdChip key={tag} tone={tag === "舊資料匯入" ? "tertiary" : "primary"}>
                      {tag}
                    </MdChip>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-outline-variant p-3">
                  <p className="md-label-m text-on-surface-variant">Agent / WhatsApp</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <MdChip tone={control.automationMode === "agent_allowed" ? "primary" : "tertiary"}>
                      {control.automationMode === "agent_allowed" ? "可由 Agent 處理" : "僅人工"}
                    </MdChip>
                    <MdChip tone={control.whatsappConsent === "opted_out" ? "error" : control.whatsappConsent === "opted_in" ? "secondary" : "neutral"}>
                      {consentLabel(control.whatsappConsent)}
                    </MdChip>
                    {utilityAllowed && <MdChip tone="secondary">服務提醒</MdChip>}
                    {marketingAllowed && <MdChip tone="secondary">Marketing</MdChip>}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {control.automationMode === "agent_allowed" ? (
                      <MdButton
                        size="sm"
                        variant="outlined"
                        onClick={() => messaging.setHumanOnly(customer.id, "STAFF_SET_HUMAN_ONLY", currentStaff.id)}
                      >
                        切到僅人工
                      </MdButton>
                    ) : (
                      <MdButton
                        size="sm"
                        variant="outlined"
                        onClick={() => messaging.resumeAgent(customer.id, currentStaff.id)}
                      >
                        明確恢復 Agent
                      </MdButton>
                    )}

                    {!utilityAllowed && control.whatsappConsent !== "opted_out" && (
                      <MdButton
                        size="sm"
                        variant="tonal"
                        onClick={() => {
                          messaging.recordWhatsAppOptIn(customer.id, ["utility"], currentStaff.id);
                          toast.success("已記錄服務類 WhatsApp opt-in", {
                            description: "正式上線仍需保存客戶實際同意的來源證據。",
                          });
                        }}
                      >
                        記錄服務類同意
                      </MdButton>
                    )}

                    {utilityAllowed && !marketingAllowed && control.whatsappConsent !== "opted_out" && (
                      <MdButton
                        size="sm"
                        variant="text"
                        onClick={() => {
                          messaging.recordWhatsAppOptIn(customer.id, ["utility", "marketing"], currentStaff.id);
                          toast.success("已記錄 Marketing opt-in", {
                            description: "只應在客戶已明確同意接收 Marketing 訊息後使用。",
                          });
                        }}
                      >
                        記錄 Marketing 同意
                      </MdButton>
                    )}

                    {control.whatsappConsent !== "opted_out" && (
                      <MdButton
                        size="sm"
                        variant="text"
                        onClick={() => messaging.recordWhatsAppOptOut(customer.id, currentStaff.id)}
                      >
                        記錄停止 WhatsApp
                      </MdButton>
                    )}
                  </div>
                </div>

                {customer.subjects.length > 0 && (
                  <div className="mt-3 rounded-xl bg-surface-container p-3">
                    <p className="md-label-m text-on-surface-variant">{vertical.labels.subject}</p>
                    {customer.subjects.map((subject) => (
                      <div key={subject.id} className="mt-1 md-body-s text-on-surface">
                        <span className="font-medium">{subject.displayName}</span>
                        {Object.entries(subject.fields).map(([key, value]) => (
                          <span key={key} className="ml-2 text-on-surface-variant">
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <dl className="mt-3 space-y-1 md-body-s text-on-surface-variant">
                  <div>上次服務：{customer.followUp?.lastService ?? (legacy?.lastVisitAt ? "到店 / 到場" : "—")}</div>
                  <div>
                    上次日期：
                    {customer.followUp?.lastServiceDate
                      ? fmtDate(customer.followUp.lastServiceDate)
                      : legacy?.lastVisitAt
                        ? fmtDate(legacy.lastVisitAt)
                        : "—"}
                  </div>
                  <div>
                    跟進提示：
                    {customer.followUp?.ruleLabel ??
                      customer.followUp?.followUpHint ??
                      (legacy?.nextRecallAt ? fmtDate(legacy.nextRecallAt) : "—")}
                  </div>
                  {customer.followUp?.dueAt && <div>建議跟進日期：{fmtDate(customer.followUp.dueAt)}</div>}
                  <div>未來排程：{upcoming.length} 宗</div>
                  <div>行政備註：{customer.notesAdmin || "—"}</div>
                </dl>
              </MdCard>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 md-body-s text-on-surface-variant">
        <Search className="size-4" /> 不同商戶與行業的客戶及排程資料會分開保存；舊牙科示範資料只出現在牙科行業。
      </p>
    </PageContainer>
  );
}
