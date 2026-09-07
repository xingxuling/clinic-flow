import type { ServiceCustomer } from "@/customers/types";
import { findDuplicateCustomers, blocksAutomaticSave } from "@/importing/deduplication";
import { documentExtractionProviders } from "@/importing/extraction-provider";
import { createVerticalImportSchema } from "@/importing/schema";
import type {
  ApprovedImportProjection,
  LegacyImportCandidate,
  LegacyImportSource,
} from "@/importing/types";
import type { ServiceVerticalPack } from "@/verticals/types";

function id(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function fieldValue(candidate: LegacyImportCandidate, key: string): string {
  return candidate.fields.find((field) => field.key === key)?.reviewedValue.trim() ?? "";
}

function subjectFields(candidate: LegacyImportCandidate): Record<string, string> {
  return Object.fromEntries(
    candidate.fields
      .filter((field) => field.key.startsWith("subject.") && field.reviewedValue.trim())
      .map((field) => [field.key.slice("subject.".length), field.reviewedValue.trim()]),
  );
}

export class LegacyImportService {
  async prepare(
    source: LegacyImportSource,
    vertical: ServiceVerticalPack,
    existingCustomers: readonly ServiceCustomer[],
  ): Promise<LegacyImportCandidate> {
    if (source.tenantId.trim() === "") throw new Error("IMPORT_TENANT_REQUIRED");
    const schema = createVerticalImportSchema(vertical);
    const provider = documentExtractionProviders.resolve(source);
    const extraction = await provider.extract({ source, schema });

    const fields = schema.fields.map((schemaField) => {
      const extracted = extraction.fields.find((field) => field.key === schemaField.key);
      return {
        key: schemaField.key,
        label: schemaField.label,
        value: extracted?.value ?? "",
        reviewedValue: extracted?.value ?? "",
        confidence: extracted?.confidence ?? 0,
        sourceRegion: extracted?.sourceRegion,
        evidenceText: extracted?.evidenceText,
        accepted: false,
        corrected: false,
      };
    });

    const displayName = fields.find((field) => field.key === "customer.name")?.reviewedValue ?? "";
    const phone = fields.find((field) => field.key === "customer.phone")?.reviewedValue ?? "";

    return {
      id: id("imp"),
      tenantId: source.tenantId,
      verticalId: vertical.id,
      source,
      extraction,
      schema,
      fields,
      duplicates: findDuplicateCustomers(existingCustomers, { displayName, phone }),
      status: "needs_review",
      createdAt: new Date().toISOString(),
    };
  }

  updateField(candidate: LegacyImportCandidate, key: string, reviewedValue: string): LegacyImportCandidate {
    if (candidate.status !== "needs_review") throw new Error("IMPORT_NOT_REVIEWABLE");
    const fields = candidate.fields.map((field) =>
      field.key === key
        ? {
            ...field,
            reviewedValue,
            accepted: false,
            corrected: reviewedValue.trim() !== field.value.trim(),
          }
        : field,
    );
    return { ...candidate, fields };
  }

  acceptField(candidate: LegacyImportCandidate, key: string): LegacyImportCandidate {
    if (candidate.status !== "needs_review") throw new Error("IMPORT_NOT_REVIEWABLE");
    const fields = candidate.fields.map((field) =>
      field.key === key ? { ...field, accepted: true } : field,
    );
    return { ...candidate, fields };
  }

  recomputeDuplicates(
    candidate: LegacyImportCandidate,
    existingCustomers: readonly ServiceCustomer[],
  ): LegacyImportCandidate {
    return {
      ...candidate,
      duplicates: findDuplicateCustomers(existingCustomers, {
        displayName: fieldValue(candidate, "customer.name"),
        phone: fieldValue(candidate, "customer.phone"),
      }),
    };
  }

  approve(candidate: LegacyImportCandidate, allowDuplicateOverride = false): LegacyImportCandidate {
    if (candidate.status !== "needs_review") throw new Error("IMPORT_NOT_REVIEWABLE");
    const missing = candidate.schema.fields
      .filter((schemaField) => schemaField.required)
      .filter((schemaField) => !fieldValue(candidate, schemaField.key));
    if (missing.length) throw new Error(`IMPORT_REQUIRED_FIELDS_MISSING:${missing.map((field) => field.key).join(",")}`);

    const unreviewedRequired = candidate.schema.fields
      .filter((schemaField) => schemaField.required)
      .filter((schemaField) => !candidate.fields.find((field) => field.key === schemaField.key)?.accepted);
    if (unreviewedRequired.length) {
      throw new Error(
        `IMPORT_REQUIRED_FIELDS_NOT_REVIEWED:${unreviewedRequired.map((field) => field.key).join(",")}`,
      );
    }

    if (blocksAutomaticSave(candidate.duplicates) && !allowDuplicateOverride) {
      throw new Error(`IMPORT_DUPLICATE_REVIEW_REQUIRED:${candidate.duplicates[0]?.customerId ?? "unknown"}`);
    }

    return { ...candidate, status: "approved", reviewedAt: new Date().toISOString() };
  }

  projectApproved(candidate: LegacyImportCandidate): ApprovedImportProjection {
    if (candidate.status !== "approved" && candidate.status !== "saved") {
      throw new Error("IMPORT_MUST_BE_APPROVED_BEFORE_PROJECTION");
    }
    const displayName = fieldValue(candidate, "customer.name");
    const phone = fieldValue(candidate, "customer.phone");
    const preferredChannel = fieldValue(candidate, "customer.preferred_channel") || "whatsapp";
    const language = fieldValue(candidate, "customer.language") || "zh-HK";
    const notes = fieldValue(candidate, "customer.notes_admin");
    const subject = subjectFields(candidate);

    return {
      customer: {
        tenantId: candidate.tenantId,
        displayName,
        phone,
        preferredChannel: preferredChannel as ApprovedImportProjection["customer"]["preferredChannel"],
        language: language as ApprovedImportProjection["customer"]["language"],
        notesAdmin: notes,
        tags: ["舊資料匯入"],
        subjects:
          Object.keys(subject).length > 0
            ? [
                {
                  id: id("sub"),
                  kind: "none",
                  displayName: subject.name ?? candidate.schema.subjectLabel,
                  fields: subject,
                },
              ]
            : [],
        source: "legacy_import",
        sourceRef: `${candidate.extraction.providerId}:${candidate.source.id}`,
      },
      followUp: {
        lastService: fieldValue(candidate, "follow_up.last_service") || undefined,
        lastServiceDate: fieldValue(candidate, "follow_up.last_service_date") || undefined,
        followUpHint: fieldValue(candidate, "follow_up.hint") || undefined,
      },
    };
  }

  markSaved(candidate: LegacyImportCandidate, savedCustomerId: string): LegacyImportCandidate {
    if (candidate.status !== "approved") throw new Error("IMPORT_MUST_BE_APPROVED_BEFORE_SAVE");
    return { ...candidate, status: "saved", savedCustomerId };
  }
}

export const legacyImportService = new LegacyImportService();
