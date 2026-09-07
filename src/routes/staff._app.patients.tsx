import { createFileRoute } from "@tanstack/react-router";
import { Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { useServiceBookings } from "@/bookings/use-service-bookings";
import { LegacyImportPanel } from "@/components/importing/LegacyImportPanel";
import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdCard, MdChip, MdTextField, SectionHeader } from "@/components/m3";
import { VerticalSwitcher } from "@/components/verticals/VerticalSwitcher";
import { patientToServiceCustomer } from "@/customers/types";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { CHANNEL, fmtDate } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/patients")({
  head: () => ({
    meta: [
      { title: "客戶目錄｜Service Frontdesk" },
      { name: "description", content: "通用服務業客戶目錄、舊資料拍照匯入與人工核對。" },
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

function CustomersPage() {
  const {
    patients,
    clinic,
    appointments,
    setAppointmentStatus,
    rescheduleAppointment,
    createAppointment,
  } = useApp();
  const vertical = useTenantVertical(clinic);
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
      title={`${vertical.labels.customer}目錄`}
      subtitle={`通用客戶資料庫：${vertical.labels.customer}、${vertical.labels.subject}、跟進資料與舊系統匯入。`}
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
          <p>只保留完成客戶溝通、排程與跟進所需資料；專業判斷資料不應進入通用 Frontdesk Core。</p>
          <p className="mt-1">
            {mask ? "列表電話號碼已按隱私設定遮蔽部分數字。" : "列表顯示完整電話號碼。"}
          </p>
        </div>
      </MdCard>

      <MdTextField
        label=""
        placeholder={`搜尋${vertical.labels.customer}姓名、電話或標籤`}
        value={q}
        onChange={(event) => setQ(event.target.value)}
        className="mb-4 max-w-sm"
      />

      <SectionHeader title={vertical.labels.customers} count={list.length} />
      {list.length === 0 ? (
        <EmptyState text={`沒有符合的${vertical.labels.customer}。`} />
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
            return (
              <MdCard key={customer.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="md-title-m truncate text-on-surface">{customer.displayName}</p>
                    <p className="md-body-s text-on-surface-variant">
                      {legacy
                        ? `Dental 舊檔 ${legacy.fileNo}`
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
                  <div>上次服務：{customer.followUp?.lastService ?? (legacy?.lastVisitAt ? "到診" : "—")}</div>
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
                  <div>{vertical.labels.bookings}：{upcoming.length} 宗</div>
                  <div>行政備註：{customer.notesAdmin || "—"}</div>
                </dl>
              </MdCard>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 md-body-s text-on-surface-variant">
        <Search className="size-4" /> Dental Seed 只屬 Dental Pack；新 Customer / Booking 按 Tenant + Vertical 隔離並持久化。
      </p>
    </PageContainer>
  );
}
