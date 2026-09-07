import { createFileRoute } from "@tanstack/react-router";
import { AlertOctagon, FileText } from "lucide-react";
import { useMemo, useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip, SectionHeader } from "@/components/m3";
import { useServiceCustomers } from "@/customers/use-service-customers";
import { DOCUMENT_KIND, DOCUMENT_STATUS, fmtDateTime } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { DocumentKind } from "@/types/domain";
import { filterByVertical } from "@/verticals/entity-scope";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/documents")({
  head: () => ({
    meta: [
      { title: "資料｜Service Frontdesk" },
      { name: "description", content: "服務業表單、報價、收據、發票與其他行政資料。" },
    ],
  }),
  component: DocumentsPage,
});

const KINDS: { value: DocumentKind | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "insurance_form", label: "保險表格" },
  { value: "referral", label: "轉介信" },
  { value: "receipt", label: "收據" },
  { value: "invoice", label: "發票" },
];

function suggestedFlows(verticalId: string): string[] {
  switch (verticalId) {
    case "pet-care":
      return ["寄養／美容資料", "服務確認", "收據", "發票"];
    case "auto-repair":
      return ["報價單", "維修／保養工單", "收據", "發票"];
    case "home-service":
      return ["上門需求資料", "報價單", "完工確認", "收據／發票"];
    case "beauty":
      return ["服務／療程資料", "預約確認", "收據", "發票"];
    default:
      return ["行政表格", "服務資料", "收據", "發票"];
  }
}

function DocumentsPage() {
  const { documents, clinic, patients, markDocumentReady } = useApp();
  const vertical = useTenantVertical(clinic);
  const { customers } = useServiceCustomers({ clinic, vertical, legacyPatients: patients });
  const [kind, setKind] = useState<DocumentKind | "all">("all");

  const visibleDocuments = useMemo(
    () => filterByVertical(documents, vertical.id),
    [documents, vertical.id],
  );
  const list = visibleDocuments.filter((document) => kind === "all" || document.kind === kind);
  const issues = visibleDocuments.filter((document) => document.status === "anomaly" || document.status === "needs_fields");
  const flows = useMemo(() => suggestedFlows(vertical.id), [vertical.id]);
  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.displayName ?? `客戶 ${id}`;

  return (
    <PageContainer
      title="資料"
      subtitle={`${vertical.displayName} · 表單、報價、工單、收據與發票`}
    >
      <MdCard className="mb-5 p-4">
        <p className="md-label-l text-on-surface">常見資料</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {flows.map((flow) => <MdChip key={flow} tone="secondary">{flow}</MdChip>)}
        </div>
        <p className="mt-3 md-body-s text-on-surface-variant">
          舊牙科示範文件只會在牙科行業顯示；其他行業不會混入醫療文件。
        </p>
      </MdCard>

      {issues.length > 0 && (
        <MdCard className="mb-5 flex items-center gap-3 bg-error-container p-4 text-on-error-container">
          <AlertOctagon className="size-5 shrink-0" />
          <p className="md-body-m">{issues.length} 份資料需要人工處理：缺欄位或異常。</p>
        </MdCard>
      )}

      {vertical.id === "dental" && (
        <div className="mb-4 flex flex-wrap gap-2">
          {KINDS.map((item) => (
            <MdFilterChip key={item.value} selected={kind === item.value} onClick={() => setKind(item.value)}>
              {item.label}
            </MdFilterChip>
          ))}
        </div>
      )}

      <SectionHeader title={vertical.id === "dental" ? "既有資料" : "資料列表"} count={list.length} />
      {list.length === 0 ? (
        <EmptyState
          text={`目前尚未建立 ${vertical.displayName} 的實際文件資料。`}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {list.map((document) => {
            const status = DOCUMENT_STATUS[document.status];
            return (
              <MdCard key={document.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="md-title-m truncate text-on-surface">{document.title}</p>
                    <p className="md-body-s text-on-surface-variant">
                      {DOCUMENT_KIND[document.kind]} · {customerName(document.patientId)}
                    </p>
                  </div>
                  <MdChip tone={status.tone}>{status.label}</MdChip>
                </div>

                {document.amountHKD !== undefined && (
                  <p className="mt-3 md-body-m text-on-surface">金額：HK${document.amountHKD.toLocaleString()}</p>
                )}
                {document.missingFields.length > 0 && (
                  <div className="mt-3">
                    <p className="md-label-m text-on-surface-variant">缺少欄位</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {document.missingFields.map((field) => <MdChip key={field} tone="tertiary">{field}</MdChip>)}
                    </div>
                  </div>
                )}
                {document.anomalies.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 md-body-s text-error">
                    {document.anomalies.map((anomaly) => <li key={anomaly}>{anomaly}</li>)}
                  </ul>
                )}

                <p className="mt-3 md-body-s text-on-surface-variant">更新於 {fmtDateTime(document.updatedAt)}</p>
                {document.status !== "ready" && document.status !== "sent" && (
                  <MdButton size="sm" variant="tonal" className="mt-3 self-start" onClick={() => markDocumentReady(document.id)}>
                    人工覆核完成
                  </MdButton>
                )}
              </MdCard>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
