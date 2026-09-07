import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, ContactRound, FileUp, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { MdButton, MdCard, MdChip, MdTextField } from "@/components/m3";
import { serviceCustomerRepository } from "@/customers/repository";
import type { ServiceCustomer } from "@/customers/types";
import { contactSink } from "@/importing/contact-sink";
import { legacyImportService } from "@/importing/import-service";
import type { LegacyImportCandidate, LegacyImportSource, LegacyImportSourceKind } from "@/importing/types";
import type { ServiceVerticalPack } from "@/verticals/types";

function sourceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `src_${crypto.randomUUID()}`;
  return `src_${Date.now().toString(36)}`;
}

function confidenceTone(value: number): "primary" | "tertiary" | "error" {
  if (value >= 0.9) return "primary";
  if (value >= 0.75) return "tertiary";
  return "error";
}

function confidenceLabel(value: number) {
  if (value >= 0.9) return `高 ${Math.round(value * 100)}%`;
  if (value >= 0.75) return `中 ${Math.round(value * 100)}%`;
  return `低 ${Math.round(value * 100)}%`;
}

export function LegacyImportPanel({
  tenantId,
  vertical,
  existingCustomers,
  onSaved,
}: {
  tenantId: string;
  vertical: ServiceVerticalPack;
  existingCustomers: readonly ServiceCustomer[];
  onSaved?: (customer: ServiceCustomer) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<LegacyImportCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicateOverride, setDuplicateOverride] = useState(false);
  const [exportContact, setExportContact] = useState(false);

  const allCustomers = useMemo(
    () => [...existingCustomers, ...serviceCustomerRepository.list(tenantId)],
    [existingCustomers, tenantId, candidate?.savedCustomerId],
  );

  const startImport = async (file: File, kind: LegacyImportSourceKind) => {
    setBusy(true);
    try {
      const ref = URL.createObjectURL(file);
      const source: LegacyImportSource = {
        id: sourceId(),
        tenantId,
        kind,
        filename: file.name || (kind === "camera_photo" ? "camera-photo.jpg" : "legacy-file"),
        mimeType: file.type || "application/octet-stream",
        capturedAt: new Date().toISOString(),
        dataRef: ref,
      };
      const prepared = await legacyImportService.prepare(source, vertical, allCustomers);
      setCandidate(prepared);
      setDuplicateOverride(false);
      toast.success("已擷取資料", { description: "請逐項核對後再保存。" });
    } catch (error) {
      toast.error("無法擷取資料", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const update = (key: string, value: string) => {
    if (!candidate) return;
    const changed = legacyImportService.updateField(candidate, key, value);
    setCandidate(legacyImportService.recomputeDuplicates(changed, allCustomers));
  };

  const accept = (key: string) => {
    if (!candidate) return;
    setCandidate(legacyImportService.acceptField(candidate, key));
  };

  const acceptRequired = () => {
    if (!candidate) return;
    let next = candidate;
    for (const schemaField of candidate.schema.fields.filter((field) => field.required)) {
      if (next.fields.find((field) => field.key === schemaField.key)?.reviewedValue.trim()) {
        next = legacyImportService.acceptField(next, schemaField.key);
      }
    }
    setCandidate(legacyImportService.recomputeDuplicates(next, allCustomers));
  };

  const save = async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      const refreshed = legacyImportService.recomputeDuplicates(candidate, allCustomers);
      const approved = legacyImportService.approve(refreshed, duplicateOverride);
      const projection = legacyImportService.projectApproved(approved);
      const customer = serviceCustomerRepository.add({
        ...projection.customer,
        followUp: projection.followUp,
      });
      const saved = legacyImportService.markSaved(approved, customer.id);
      setCandidate(saved);
      onSaved?.(customer);

      if (exportContact) {
        const result = await contactSink.save(customer);
        toast.success("客戶已保存", { description: result.detail });
      } else {
        toast.success("客戶已保存", { description: "已進入通用客戶資料庫。" });
      }
    } catch (error) {
      toast.error("尚未保存", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <MdCard variant="outlined" className="mb-6 overflow-hidden">
      <div className="border-b border-outline-variant p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Camera className="size-5 text-primary" />
              <h2 className="md-title-m text-on-surface">拍照匯入舊資料</h2>
            </div>
            <p className="mt-1 max-w-2xl md-body-m text-on-surface-variant">
              拍舊系統畫面、客戶卡、預約簿或上傳截圖／文件；AI 只負責擷取，最後一定由人手核對。
            </p>
          </div>
          <MdChip tone="secondary">{vertical.displayName}</MdChip>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <MdButton
            icon={<Camera className="size-4" />}
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
          >
            用手機拍攝
          </MdButton>
          <MdButton
            variant="outlined"
            icon={<FileUp className="size-4" />}
            onClick={() => uploadRef.current?.click()}
            disabled={busy}
          >
            上傳截圖 / 文件
          </MdButton>
          {candidate && (
            <MdButton
              variant="text"
              icon={<RefreshCw className="size-4" />}
              onClick={() => setCandidate(null)}
            >
              重新開始
            </MdButton>
          )}
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void startImport(file, "camera_photo");
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*,.pdf,.csv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const kind: LegacyImportSourceKind = file.type.startsWith("image/")
              ? "screenshot"
              : file.name.toLowerCase().endsWith(".pdf")
                ? "pdf"
                : "spreadsheet";
            void startImport(file, kind);
            event.currentTarget.value = "";
          }}
        />
      </div>

      {!candidate ? (
        <div className="p-4 md:p-5">
          <div className="flex items-start gap-3 rounded-xl bg-surface-container p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="md-body-s text-on-surface-variant">
              <p>目前 Demo 使用模擬 Extraction Provider，目的是驗證完整操作流程。</p>
              <p className="mt-1">真實 OCR/VLM 接入後仍沿用相同欄位、置信度、來源區域、人審與去重契約。</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <MdChip tone="neutral">{candidate.source.filename}</MdChip>
            <MdChip tone="secondary">{candidate.extraction.providerId}</MdChip>
            {candidate.extraction.warnings.includes("DEMO_PROVIDER_ONLY") && (
              <MdChip tone="tertiary">Demo 擷取</MdChip>
            )}
          </div>

          {candidate.duplicates.length > 0 && (
            <div className="mb-4 rounded-xl bg-error-container p-4 text-on-error-container">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="md-label-l">發現可能重複客戶</p>
                  {candidate.duplicates.slice(0, 3).map((duplicate) => (
                    <p key={duplicate.customerId} className="mt-1 md-body-s">
                      {duplicate.displayName} · {duplicate.phone} · {Math.round(duplicate.score * 100)}%
                    </p>
                  ))}
                  <label className="mt-3 flex cursor-pointer items-center gap-2 md-body-s">
                    <input
                      type="checkbox"
                      checked={duplicateOverride}
                      onChange={(event) => setDuplicateOverride(event.target.checked)}
                    />
                    我已人工核對，仍要建立新的{vertical.labels.customer}
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {candidate.fields.map((field) => {
              const schemaField = candidate.schema.fields.find((item) => item.key === field.key);
              return (
                <div key={field.key} className="rounded-xl border border-outline-variant p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="md-label-l text-on-surface">
                      {field.label}{schemaField?.required ? " *" : ""}
                    </span>
                    <MdChip tone={confidenceTone(field.confidence)}>{confidenceLabel(field.confidence)}</MdChip>
                  </div>
                  <MdTextField
                    label=""
                    value={field.reviewedValue}
                    onChange={(event) => update(field.key, event.target.value)}
                    placeholder="未識別"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="md-body-s text-on-surface-variant">
                      {field.corrected ? "已由人手修正" : field.accepted ? "已人工確認" : "待核對"}
                    </span>
                    <MdButton
                      size="sm"
                      variant={field.accepted ? "tonal" : "outlined"}
                      icon={<Check className="size-3.5" />}
                      onClick={() => accept(field.key)}
                    >
                      {field.accepted ? "已確認" : "確認"}
                    </MdButton>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-outline-variant pt-4">
            <MdButton variant="tonal" onClick={acceptRequired}>確認所有必填欄位</MdButton>
            <label className="flex items-center gap-2 md-body-s text-on-surface-variant">
              <input
                type="checkbox"
                checked={exportContact}
                onChange={(event) => setExportContact(event.target.checked)}
              />
              <ContactRound className="size-4" /> 保存後同時匯出通訊錄 vCard
            </label>
            <MdButton className="ml-auto" onClick={() => void save()} disabled={busy || candidate.status === "saved"}>
              {candidate.status === "saved" ? "已保存" : "確認並保存"}
            </MdButton>
          </div>
        </div>
      )}
    </MdCard>
  );
}
