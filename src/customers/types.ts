import type { ChannelKind, Patient } from "@/types/domain";
import type { ServiceSubjectKind } from "@/verticals/types";

export type CustomerLanguage = "zh-HK" | "zh-CN" | "en";

export interface ServiceSubjectRecord {
  id: string;
  kind: ServiceSubjectKind;
  displayName: string;
  fields: Record<string, string>;
}

export interface CustomerFollowUpSnapshot {
  lastService?: string;
  lastServiceDate?: string;
  followUpHint?: string;
  ruleId?: string;
  ruleLabel?: string;
  dueAt?: string;
  customerMessage?: string;
}

export interface ServiceCustomer {
  id: string;
  tenantId: string;
  verticalId: string;
  displayName: string;
  phone: string;
  preferredChannel: ChannelKind;
  language: CustomerLanguage;
  tags: string[];
  notesAdmin: string;
  subjects: ServiceSubjectRecord[];
  followUp?: CustomerFollowUpSnapshot;
  source: "legacy_patient_compat" | "legacy_import" | "manual" | "integration";
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewServiceCustomerInput {
  tenantId: string;
  verticalId: string;
  displayName: string;
  phone: string;
  preferredChannel?: ChannelKind;
  language?: CustomerLanguage;
  tags?: string[];
  notesAdmin?: string;
  subjects?: ServiceSubjectRecord[];
  followUp?: CustomerFollowUpSnapshot;
  source: ServiceCustomer["source"];
  sourceRef?: string;
}

/**
 * 旧 Clinic/Patient 模型的兼容投影。新 Core 不应要求其他行业创建 Patient。
 */
export function patientToServiceCustomer(patient: Patient): ServiceCustomer {
  const followUp: CustomerFollowUpSnapshot = {
    ...(patient.lastVisitAt ? { lastServiceDate: patient.lastVisitAt } : {}),
    ...(patient.nextRecallAt
      ? {
          followUpHint: `下次跟進：${patient.nextRecallAt}`,
          dueAt: patient.nextRecallAt,
        }
      : {}),
  };

  return {
    id: patient.id,
    tenantId: patient.clinicId,
    verticalId: "dental",
    displayName: patient.name,
    phone: patient.phone,
    preferredChannel: patient.preferredChannel,
    language: patient.language,
    tags: [...patient.tags],
    notesAdmin: patient.notesAdmin,
    subjects: [],
    ...(Object.keys(followUp).length > 0 ? { followUp } : {}),
    source: "legacy_patient_compat",
    sourceRef: `patient:${patient.id}`,
    createdAt: patient.lastVisitAt ?? new Date(0).toISOString(),
    updatedAt: patient.lastVisitAt ?? new Date(0).toISOString(),
  };
}
