import { createFileRoute } from "@tanstack/react-router";
import { Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { LegacyImportPanel } from "@/components/importing/LegacyImportPanel";
import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdCard, MdChip, MdTextField, SectionHeader } from "@/components/m3";
import { VerticalSwitcher } from "@/components/verticals/VerticalSwitcher";
import { serviceCustomerRepository } from "@/customers/repository";
import { patientToServiceCustomer, type ServiceCustomer } from "@/customers/types";
import { CHANNEL, fmtDate } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import { resolveVerticalPackForClinic } from "@/verticals/registry";
import { resolveVerticalPackForTenant } from "@/verticals/tenant-selection";

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
  const { patients, clinic, appointments } = useApp();
  const [q, setQ] = useState("");
  const [imported, setImported] = useState<ServiceCustomer[]>([]);
  const [vertical, setVertical] = useState(() => resolveVerticalPackForClinic(clinic));
  const mask = clinic.settings.privacy.maskPhoneInLists;

  const legacyCustomers = useMemo(() => patients.map(patientToServiceCustomer), [patients]);

  useEffect(() => {
    const refresh = () => setImported(serviceCustomerRepository.list(clinic.id));
    refresh();
    setVertical(resolveVerticalPackForTenant(clinic));
    window.addEventListener("service-frontdesk:customers-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("service-frontdesk:customers-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [clinic]);

  const customers = useMemo(() => {
    const byId = new Map<string, ServiceCustomer>();
    for (const customer of legacyCustomers) byId.set(customer.id, customer);
    for (const customer of imported) byId.set(customer.id, customer);
    return [...byId.values()];
  }, [legacyCustomers, imported]);

  const list = customers.filter((customer) => {
    const query = q.trim().toLocaleLowerCase();
    if (!query) return true;
    return (
      customer.displayName.toLocaleLowerCase().includes(query) ||
      customer.phone.includes(query) ||
      customer.tags.some((tag) => tag.toLocaleLowerCase().includes(query))
    );
  });

  const legacyById = new Map(patients.map((patient) => [patient.id, patient]));

  return (
    <PageContainer
      title={`${vertical.labels.customer}目錄`}
      subtitle={`通用客戶資料庫：${vertical.labels.customer}、${vertical.labels.subject}、跟進資料與舊系統匯入。`}
    >
      <VerticalSwitcher tenantId={clinic.id} vertical={vertical} onChange={setVertical} />

      <LegacyImportPanel
        key={vertical.id}
        tenantId={clinic.id}
        vertical={vertical}
        existingCustomers={legacyCustomers}
        onSaved={() => setImported(serviceCustomerRepository.list(clinic.id))}
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
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <SectionHeader title={vertical.labels.customers} count={list.length} />
      {list.length === 0 ? (
        <EmptyState text={`沒有符合的${vertical.labels.customer}。`} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((customer) => {
            const legacy = legacyById.get(customer.id);
            const upcoming = appointments.filter(
              (appointment) =>
                appointment.patientId === customer.id &&
                new Date(appointment.startAt) > new Date() &&
                appointment.status !== "cancelled",
            );
            return (
              <MdCard key={customer.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="md-title-m truncate text-on-surface">{customer.displayName}</p>
                    <p className="md-body-s text-on-surface-variant">
                      {legacy
                        ? `舊診所檔案 ${legacy.fileNo}`
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
                  <div>
                    上次服務：{customer.followUp?.lastService ?? (legacy?.lastVisitAt ? "到診" : "—")}
                  </div>
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
                    {customer.followUp?.followUpHint ??
                      (legacy?.nextRecallAt ? fmtDate(legacy.nextRecallAt) : "—")}
                  </div>
                  <div>{vertical.labels.bookings}：{upcoming.length} 宗</div>
                  <div>行政備註：{customer.notesAdmin || "—"}</div>
                </dl>
              </MdCard>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 md-body-s text-on-surface-variant">
        <Search className="size-4" /> 既有診所 Seed 為虛構示範資料；新匯入資料目前保存在瀏覽器 Demo Customer Repository。
      </p>
    </PageContainer>
  );
}
