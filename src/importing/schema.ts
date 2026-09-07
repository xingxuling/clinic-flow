import type { ServiceVerticalPack } from "@/verticals/types";
import type { VerticalImportSchema } from "@/importing/types";

function followUpServiceNames(pack: ServiceVerticalPack): string[] {
  const prioritizedIds: string[] = [];
  for (const rule of pack.followUpRules) {
    for (const serviceId of rule.serviceIds ?? []) {
      if (!prioritizedIds.includes(serviceId)) prioritizedIds.push(serviceId);
    }
  }
  const prioritized = prioritizedIds
    .map((id) => pack.services.find((service) => service.id === id)?.name)
    .filter((value): value is string => Boolean(value));
  const rest = pack.services.map((service) => service.name).filter((name) => !prioritized.includes(name));
  return [...prioritized, ...rest];
}

export function createVerticalImportSchema(pack: ServiceVerticalPack): VerticalImportSchema {
  const subjectFields = pack.subjectFields.map((field) => ({
    key: `subject.${field.key}`,
    label: `${pack.labels.subject}${field.label}`,
    kind: field.kind === "number" ? "text" : field.kind,
    required: field.required,
    options: field.options,
    target: "subject" as const,
  }));

  return {
    verticalId: pack.id,
    customerLabel: pack.labels.customer,
    subjectLabel: pack.labels.subject,
    subjectKind: pack.subjectKind,
    fields: [
      {
        key: "customer.name",
        label: `${pack.labels.customer}姓名 / 名稱`,
        kind: "text",
        required: true,
        target: "customer",
      },
      {
        key: "customer.phone",
        label: "電話",
        kind: "phone",
        required: true,
        target: "customer",
      },
      {
        key: "customer.preferred_channel",
        label: "首選聯絡方式",
        kind: "select",
        required: false,
        options: ["whatsapp", "phone", "web"],
        target: "customer",
      },
      {
        key: "customer.language",
        label: "語言",
        kind: "select",
        required: false,
        options: ["zh-HK", "zh-CN", "en"],
        target: "customer",
      },
      {
        key: "customer.notes_admin",
        label: "行政備註",
        kind: "textarea",
        required: false,
        target: "customer",
      },
      ...subjectFields,
      {
        key: "follow_up.last_service",
        label: "上次服務",
        kind: "select",
        required: false,
        options: followUpServiceNames(pack),
        target: "follow_up",
      },
      {
        key: "follow_up.last_service_date",
        label: "上次服務日期",
        kind: "date",
        required: false,
        target: "follow_up",
      },
      {
        key: "follow_up.hint",
        label: "跟進 / 召回提示",
        kind: "text",
        required: false,
        target: "follow_up",
      },
    ],
  };
}
