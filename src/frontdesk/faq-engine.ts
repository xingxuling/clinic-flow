export type FaqChannel = "whatsapp" | "web" | "phone";

export type FaqCategory =
  | "opening_hours"
  | "location"
  | "booking_policy"
  | "payment"
  | "insurance"
  | "voucher"
  | "preparation"
  | "other_admin";

export interface ClinicFaqEntry {
  id: string;
  clinicId: string;
  category: FaqCategory;
  question: string;
  answer: string;
  keywords: string[];
  channels: FaqChannel[];
  enabled: boolean;
  /**
   * FAQ 只允许行政资料。任何带医疗判断性质的条目都不能交给自动回复。
   */
  administrativeOnly: true;
}

export interface FaqMatch {
  kind: "answer" | "handoff";
  entryId?: string;
  answer?: string;
  score: number;
  reason: string;
}

const MEDICAL_ADVICE_PATTERNS = [
  /係咪.*病/u,
  /是不是.*病/u,
  /要唔要.*食藥/u,
  /要不要.*吃藥/u,
  /應該.*治療/u,
  /应该.*治疗/u,
  /點醫/u,
  /怎么治/u,
  /需唔需要.*拔/u,
  /需不需要.*拔/u,
];

function normalize(text: string): string {
  return text
    .toLocaleLowerCase("zh-HK")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function containsMedicalAdviceRequest(text: string): boolean {
  return MEDICAL_ADVICE_PATTERNS.some((pattern) => pattern.test(text));
}

function entryScore(query: string, entry: ClinicFaqEntry): number {
  const normalizedQuery = normalize(query);
  const normalizedQuestion = normalize(entry.question);
  if (!normalizedQuery) return 0;

  if (normalizedQuery === normalizedQuestion) return 1;
  if (
    normalizedQuestion.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedQuestion)
  ) {
    return 0.9;
  }

  const hits = entry.keywords.filter((keyword) =>
    normalizedQuery.includes(normalize(keyword)),
  ).length;
  if (hits === 0) return 0;

  const coverage = hits / Math.max(1, entry.keywords.length);
  return Math.min(0.85, 0.45 + coverage * 0.4);
}

/**
 * 诊所授权 FAQ 的确定性匹配器。
 *
 * 规则：
 * 1. 只读同一 clinicId、已启用、当前渠道允许的条目；
 * 2. 医疗判断类问题永远转人工；
 * 3. 低于阈值不猜答案；
 * 4. 返回答案只来自诊所已授权文本，不让模型自由补充事实。
 */
export function matchClinicFaq(input: {
  clinicId: string;
  channel: FaqChannel;
  text: string;
  entries: readonly ClinicFaqEntry[];
  threshold?: number;
}): FaqMatch {
  const threshold = input.threshold ?? 0.58;

  if (containsMedicalAdviceRequest(input.text)) {
    return {
      kind: "handoff",
      score: 0,
      reason: "MEDICAL_ADVICE_REQUEST_REQUIRES_HUMAN",
    };
  }

  const candidates = input.entries
    .filter(
      (entry) =>
        entry.clinicId === input.clinicId &&
        entry.enabled &&
        entry.administrativeOnly === true &&
        entry.channels.includes(input.channel),
    )
    .map((entry) => ({ entry, score: entryScore(input.text, entry) }))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < threshold) {
    return {
      kind: "handoff",
      score: best?.score ?? 0,
      reason: "NO_AUTHORIZED_FAQ_MATCH",
    };
  }

  return {
    kind: "answer",
    entryId: best.entry.id,
    answer: best.entry.answer,
    score: best.score,
    reason: "AUTHORIZED_ADMIN_FAQ_MATCH",
  };
}
