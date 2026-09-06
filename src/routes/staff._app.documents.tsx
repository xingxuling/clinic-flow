import { createFileRoute } from "@tanstack/react-router";
import { AlertOctagon, FileText } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/AppShell";
import { EmptyState, MdButton, MdCard, MdChip, MdFilterChip, SectionHeader } from "@/components/m3";
import { DOCUMENT_KIND, DOCUMENT_STATUS, fmtDateTime } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { DocumentKind } from "@/types/domain";

export const Route = createFileRoute("/app/documents")({
  head: () => ({
    meta: [
      { title: "行政文件｜診所行政 Agent" },
      { name: "description", content: "保險表格、轉介信、收據與發票的分類、缺欄位與異常提示（模擬資料）。" },
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

function DocumentsPage() {
  const { documents, patientName, markDocumentReady } = useApp();
  const [kind, setKind] = useState<DocumentKind | "all">("all");
  const list = documents.filter((d) => kind === "all" || d.kind === kind);
  const issues = documents.filter((d) => d.status === "anomaly" || d.status === "needs_fields");

  return (
    <PageContainer title="行政文件" subtitle="全部為模擬文件，不連接任何真實保險或會計系統。">
      {issues.length > 0 && (
        <MdCard className="mb-5 flex items-center gap-3 bg-error-container p-4 text-on-error-container">
          <AlertOctagon className="size-5 shrink-0" />
          <p className="md-body-m">{issues.length} 份文件需要處理：缺欄位或金額異常。</p>
        </MdCard>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <MdFilterChip key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)}>
            {k.label}
          </MdFilterChip>
        ))}
      </div>

      <SectionHeader title="文件" count={list.length} />
      {list.length === 0 ? (
        <EmptyState text="沒有符合條件的文件。" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => {
            const s = DOCUMENT_STATUS[d.status];
            return (
              <MdCard key={d.id} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="md-title-m truncate text-on-surface">{d.title}</p>
                    <p className="md-body-s text-on-surface-variant">
                      {DOCUMENT_KIND[d.kind]}・{patientName(d.patientId)}
                    </p>
                  </div>
                  <MdChip tone={s.tone}>{s.label}</MdChip>
                </div>

                {d.amountHKD !== undefined && (
                  <p className="mt-3 md-body-m text-on-surface">金額：HK${d.amountHKD.toLocaleString()}</p>
                )}
                {d.missingFields.length > 0 && (
                  <div className="mt-3">
                    <p className="md-label-m text-on-surface-variant">缺少欄位</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.missingFields.map((f) => (
                        <MdChip key={f} tone="tertiary">
                          {f}
                        </MdChip>
                      ))}
                    </div>
                  </div>
                )}
                {d.anomalies.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 md-body-s text-error">
                    {d.anomalies.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 md-body-s text-on-surface-variant">更新於 {fmtDateTime(d.updatedAt)}</p>
                {d.status !== "ready" && d.status !== "sent" && (
                  <MdButton size="sm" variant="tonal" className="mt-3 self-start" onClick={() => markDocumentReady(d.id)}>
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
