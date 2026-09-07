import type {
  DocumentExtractionResult,
  LegacyImportSource,
  VerticalImportSchema,
} from "@/importing/types";

export interface DocumentExtractionRequest {
  source: LegacyImportSource;
  schema: VerticalImportSchema;
}

export interface DocumentExtractionProvider {
  id: string;
  version: string;
  available: boolean;
  supportedKinds: readonly LegacyImportSource["kind"][];
  extract(request: DocumentExtractionRequest): Promise<DocumentExtractionResult>;
}

export interface DocumentExtractionProviderDescriptor {
  id: string;
  displayName: string;
  status: "demo" | "candidate" | "configured";
  deployment: "browser-demo" | "local" | "server" | "hybrid";
  notes: string;
}

const DEMO_FIELD_VALUES: Record<string, string> = {
  "customer.name": "陳大文",
  "customer.phone": "91234567",
  "customer.preferred_channel": "whatsapp",
  "customer.language": "zh-HK",
  "customer.notes_admin": "由舊系統資料匯入，待人工確認。",
  "subject.pet_name": "豆豆",
  "subject.species": "狗",
  "subject.breed": "柴犬",
  "subject.size": "中型",
  "subject.handling_notes": "到店時較緊張，先由主人陪同。",
  "subject.plate": "AB 1234",
  "subject.make_model": "Toyota Corolla",
  "subject.year": "2021",
  "subject.mileage": "42800",
  "subject.customer_description": "定期保養，另請檢查煞車聲。",
  "subject.address": "九龍旺角示範道 18 號 8 樓 A 室",
  "subject.property_type": "住宅",
  "subject.access_notes": "大堂向保安登記後上樓。",
  "subject.contact_on_site": "陳先生",
  "follow_up.last_service_date": "2026-08-17",
  "follow_up.hint": "按行業規則計算下次跟進",
};

/**
 * 产品 demo 的确定性 Provider：只证明完整流程，不声称 OCR/VLM 真实识别能力。
 * 真正 Provider 接入时必须保持同一输出契约并带 confidence / sourceRegion。
 */
export class DemoLegacyExtractionProvider implements DocumentExtractionProvider {
  id = "demo.legacy-extraction";
  version = "v0.1";
  available = true;
  supportedKinds = ["camera_photo", "screenshot", "pdf", "spreadsheet", "manual"] as const;

  async extract(request: DocumentExtractionRequest): Promise<DocumentExtractionResult> {
    const { source, schema } = request;

    const valueFor = (field: VerticalImportSchema["fields"][number]) => {
      if (field.key === "follow_up.last_service") return field.options?.[0] ?? "";
      return DEMO_FIELD_VALUES[field.key] ?? field.options?.[0] ?? "";
    };

    return {
      providerId: this.id,
      providerVersion: this.version,
      sourceId: source.id,
      fields: schema.fields.map((field, index) => {
        const value = valueFor(field);
        return {
          key: field.key,
          label: field.label,
          value,
          confidence: field.required
            ? Math.max(0.78, 0.97 - index * 0.03)
            : Math.max(0.62, 0.9 - index * 0.025),
          sourceRegion: {
            x: 0.08,
            y: Math.min(0.88, 0.08 + index * 0.07),
            width: 0.52,
            height: 0.05,
          },
          evidenceText: value,
        };
      }),
      warnings: [
        "DEMO_PROVIDER_ONLY",
        "真實 OCR/VLM Provider 尚未連接；本結果只用於驗證人工核對與保存流程。",
      ],
      rawText: "陳大文 9123 4567 2026/08/17 舊服務記錄",
    };
  }
}

export const extractionProviderDescriptors: readonly DocumentExtractionProviderDescriptor[] = [
  {
    id: "demo.legacy-extraction",
    displayName: "Demo Extraction Provider",
    status: "demo",
    deployment: "browser-demo",
    notes: "只驗證產品流程，不代表真實 OCR/VLM 準確率。",
  },
  {
    id: "navidc-ocr",
    displayName: "NaviDC-OCR",
    status: "candidate",
    deployment: "local",
    notes: "候選：手機拍攝 / 畸變文件解析；需先跑真實業務 benchmark。",
  },
  {
    id: "paddleocr-vl",
    displayName: "PaddleOCR-VL",
    status: "candidate",
    deployment: "hybrid",
    notes: "候選：屏攝、表格與通用文件解析；尚未接入。",
  },
  {
    id: "glm-ocr",
    displayName: "GLM-OCR",
    status: "candidate",
    deployment: "local",
    notes: "候選：中文資料與結構化資訊抽取；尚未接入。",
  },
];

export class DocumentExtractionProviderRegistry {
  constructor(private providers: readonly DocumentExtractionProvider[]) {}

  resolve(source: LegacyImportSource): DocumentExtractionProvider {
    const provider = this.providers.find(
      (item) => item.available && item.supportedKinds.includes(source.kind),
    );
    if (!provider) throw new Error(`NO_DOCUMENT_EXTRACTION_PROVIDER:${source.kind}`);
    return provider;
  }
}

export const documentExtractionProviders = new DocumentExtractionProviderRegistry([
  new DemoLegacyExtractionProvider(),
]);
