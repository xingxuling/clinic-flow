import type { ServiceCustomer } from "@/customers/types";
import { serviceWorkItemRepository } from "@/work-items/repository";
import type { ServiceWorkItem } from "@/work-items/types";
import type { ServiceVerticalPack } from "@/verticals/types";

export function followUpWorkItemSourceRef(customer: ServiceCustomer): string | null {
  const followUp = customer.followUp;
  if (!followUp?.dueAt || !followUp.ruleId) return null;
  return `followup:${customer.id}:${followUp.ruleId}:${followUp.dueAt}`;
}

export function createFollowUpWorkItem(input: {
  customer: ServiceCustomer;
  vertical: ServiceVerticalPack;
}): ServiceWorkItem {
  if (input.customer.verticalId !== input.vertical.id) {
    throw new Error("FOLLOW_UP_WORK_ITEM_VERTICAL_MISMATCH");
  }
  const followUp = input.customer.followUp;
  const sourceRef = followUpWorkItemSourceRef(input.customer);
  if (!followUp?.dueAt || !followUp.ruleId || !sourceRef) {
    throw new Error("FOLLOW_UP_WORK_ITEM_RULE_REQUIRED");
  }
  const existing = serviceWorkItemRepository.findBySource(
    input.customer.tenantId,
    input.customer.verticalId,
    sourceRef,
  );
  if (existing) return existing;

  const message =
    followUp.customerMessage ??
    followUp.followUpHint ??
    `${input.customer.displayName}你好，如需要可以安排下一次服務。`;

  return serviceWorkItemRepository.add({
    tenantId: input.customer.tenantId,
    verticalId: input.customer.verticalId,
    kind: "follow_up_message",
    customerId: input.customer.id,
    ...(input.customer.subjects[0]?.id ? { subjectId: input.customer.subjects[0].id } : {}),
    title: `${input.customer.displayName} · ${followUp.ruleLabel ?? "服務跟進"}`,
    intent: `為${input.vertical.labels.customer}準備服務後跟進訊息，等待人工批准後交給正式 Messaging Adapter。`,
    basis: [
      `規則：${followUp.ruleLabel ?? followUp.ruleId}`,
      ...(followUp.lastService ? [`上次服務：${followUp.lastService}`] : []),
      ...(followUp.lastServiceDate ? [`上次服務日期：${followUp.lastServiceDate}`] : []),
      `建議跟進時間：${followUp.dueAt}`,
      "WhatsApp 主動舊客召回預設按 marketing 類別處理，除非後續由 Meta 模板分類證據另行確認。",
    ],
    effects: [
      "建立 1 則待人工批准的訊息草稿",
      "批准後仍須通過 WhatsApp opt-in / 24h / template policy gate",
      "Messaging Adapter 真實成功前不標記已送出",
    ],
    risk: "low",
    proposedMessage: message,
    messagePurpose: "marketing",
    sourceRef,
  });
}
