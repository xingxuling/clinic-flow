import type { ServiceVerticalPack, VerticalFollowUpRule } from "@/verticals/types";

export interface CompletedServiceRecord {
  tenantId: string;
  customerId: string;
  subjectId?: string;
  serviceId: string;
  completedAt: string;
}

export interface FollowUpCandidate {
  tenantId: string;
  customerId: string;
  subjectId?: string;
  verticalId: string;
  ruleId: string;
  ruleLabel: string;
  sourceServiceId: string;
  sourceCompletedAt: string;
  dueAt: string;
  overdue: boolean;
  customerMessage: string;
}

function addRuleDelay(date: Date, rule: VerticalFollowUpRule): Date | null {
  const due = new Date(date);
  if (rule.afterDays !== undefined) {
    due.setUTCDate(due.getUTCDate() + rule.afterDays);
    return due;
  }
  if (rule.afterMonths !== undefined) {
    due.setUTCMonth(due.getUTCMonth() + rule.afterMonths);
    return due;
  }
  return null;
}

function identity(record: CompletedServiceRecord, ruleId: string): string {
  return [record.tenantId, record.customerId, record.subjectId ?? "", ruleId].join("::");
}

/**
 * 通用 Follow-up / Recall 规划器。
 *
 * - 只使用已完成服务的时间与行业包规则；
 * - 同一客户/服务对象/规则只以最近一次相关服务计算；
 * - 不推断健康、车辆状态、房屋状态或任何专业结论；
 * - 是否真正发送仍由消息调度层决定。
 */
export function planServiceFollowUps(input: {
  vertical: ServiceVerticalPack;
  records: readonly CompletedServiceRecord[];
  now?: Date;
}): FollowUpCandidate[] {
  const now = input.now ?? new Date();
  const latestByRule = new Map<
    string,
    { record: CompletedServiceRecord; rule: VerticalFollowUpRule }
  >();

  for (const rule of input.vertical.followUpRules) {
    if (rule.trigger !== "time_since_service") continue;
    if (rule.afterDays === undefined && rule.afterMonths === undefined) continue;

    for (const record of input.records) {
      if (rule.serviceIds?.length && !rule.serviceIds.includes(record.serviceId)) continue;
      const completedAt = new Date(record.completedAt);
      if (Number.isNaN(completedAt.getTime())) continue;

      const key = identity(record, rule.id);
      const existing = latestByRule.get(key);
      if (!existing || new Date(existing.record.completedAt) < completedAt) {
        latestByRule.set(key, { record, rule });
      }
    }
  }

  const candidates: FollowUpCandidate[] = [];
  for (const { record, rule } of latestByRule.values()) {
    const due = addRuleDelay(new Date(record.completedAt), rule);
    if (!due) continue;

    candidates.push({
      tenantId: record.tenantId,
      customerId: record.customerId,
      ...(record.subjectId === undefined ? {} : { subjectId: record.subjectId }),
      verticalId: input.vertical.id,
      ruleId: rule.id,
      ruleLabel: rule.label,
      sourceServiceId: record.serviceId,
      sourceCompletedAt: record.completedAt,
      dueAt: due.toISOString(),
      overdue: due.getTime() <= now.getTime(),
      customerMessage: rule.customerMessage,
    });
  }

  return candidates.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function dueFollowUps(
  candidates: readonly FollowUpCandidate[],
): FollowUpCandidate[] {
  return candidates.filter((candidate) => candidate.overdue);
}
