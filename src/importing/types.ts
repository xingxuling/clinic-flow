import type { ChannelKind } from "@/types/domain";
import type { CustomerLanguage, NewServiceCustomerInput } from "@/customers/types";

export type LegacyImportSourceKind =
  | "camera_photo"
  | "screenshot"
  | "pdf"
  | "spreadsheet"
  | "manual";

export interface LegacyImportSource {
  id: string;
  tenantId: string;
  kind: LegacyImportSourceKind;
  filename: string;
  mimeType: string;
  capturedAt: string;
  /**
   * 浏览器 demo 只保存临时 object URL / 文件引用，不把原图内容塞进 Agent 状态。
   * 真正生产环境应改为受控上传对象引用或本地网关内容哈希。
   */
  dataRef: string;
}

export type ImportFieldKind = "text" | "phone" | "date" | "select" | "textarea";

export interface ImportSchemaField {
  key: string;
  label: string;
  kind: ImportFieldKind;
  required: boolean;
  options?: readonly string[];
  target: "customer" | "subject" | "follow_up" | "metadata";
}

export interface VerticalImportSchema {
  verticalId: string;
  customerLabel: string;
  subjectLabel: string;
  fields: readonly ImportSchemaField[];
}

export interface SourceRegion {
  page?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedFieldCandidate {
  key: string;
  label: string;
  value: string;
  confidence: number;
  sourceRegion?: SourceRegion;
  evidenceText?: string;
}

export interface DocumentExtractionResult {
  providerId: string;
  providerVersion: string;
  sourceId: string;
  fields: ExtractedFieldCandidate[];
  warnings: string[];
  rawText?: string;
}

export type DuplicateReason = "phone_exact" | "name_exact" | "phone_and_name";

export interface DuplicateCandidate {
  customerId: string;
  displayName: string;
  phone: string;
  score: number;
  reason: DuplicateReason;
}

export type ImportReviewStatus = "needs_review" | "approved" | "saved" | "rejected";

export interface ImportReviewField extends ExtractedFieldCandidate {
  reviewedValue: string;
  accepted: boolean;
  corrected: boolean;
}

export interface LegacyImportCandidate {
  id: string;
  tenantId: string;
  verticalId: string;
  source: LegacyImportSource;
  extraction: DocumentExtractionResult;
  schema: VerticalImportSchema;
  fields: ImportReviewField[];
  duplicates: DuplicateCandidate[];
  status: ImportReviewStatus;
  createdAt: string;
  reviewedAt?: string;
  savedCustomerId?: string;
}

export interface ApprovedImportProjection {
  customer: NewServiceCustomerInput;
  followUp: {
    lastService?: string;
    lastServiceDate?: string;
    followUpHint?: string;
  };
}

export interface ImportedCustomerDefaults {
  preferredChannel: ChannelKind;
  language: CustomerLanguage;
}
