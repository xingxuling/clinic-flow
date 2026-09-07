export type FaqChannel = "whatsapp" | "web" | "phone";

export type FaqCategory =
  | "opening_hours"
  | "location"
  | "booking_policy"
  | "payment"
  | "insurance"
  | "voucher"
  | "preparation"
  | "service_area"
  | "service_scope"
  | "other_admin";

export interface ServiceFaqEntry {
  id: string;
  /** 兼容现有数据命名；语义上等同 tenantId。 */
  clinicId: string;
  category: FaqCategory;
  question: string;
  answer: string;
  keywords: string[];
  channels: FaqChannel[];
  enabled: boolean;
  /** 自动 FAQ 只能使用商户明确授权的行政/服务资料。 */
  administrativeOnly: true;
}

/** 兼容第一版牙科代码。 */
export type ClinicFaqEntry = ServiceFaqEntry;

export interface FaqMatch {
  kind: "answer" | "handoff";
  entryId?: string;
  answer?: string;
  score: number;
  reason: string;
}

export const MEDICAL_ADVICE_PATTERNS: readonly RegExp[] = [
  /係咪.*病/u,
  /是不是.*病/u,
  /要唔要.*食藥/u,
  /要唔要.*食药/u,
  /要不要.*吃藥/u,
  /要不要.*吃药/u,
  /應該.*治療/u,
  /应该.*治疗/u,
  /點醫/u,
  /点医/u,
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

function entryScore(query: string, entry: ServiceFaqEntry): number {
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
 * 通用服务业授权 FAQ 匹配器。
 *
 * blockedPatterns 由行业包提供：牙科可以拦医学判断，水电可以拦危险维修指引，
 * 核心本身不硬编码某个行业的专业知识。
 */
export function matchAuthorizedFaq(input: {
  tenantId: string;
  channel: FaqChannel;
  text: string;
  entries: readonly ServiceFaqEntry[];
  blockedPatterns?: readonly RegExp[];
  blockedReason?: string;
  threshold?: number;
}): FaqMatch {
  const threshold = input.threshold ?? 0.58;
  if (input.blockedPatterns?.some((pattern) => pattern.test(input.text))) {
    return {
      kind: "handoff",
      score: 0,
      reason: input.blockedReason ?? "RESTRICTED_QUESTION_REQUIRES_HUMAN",
    };
  }

  const candidates = input.entries
    .filter(
      (entry) =>
        entry.clinicId === input.tenantId &&
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

/**
 * 牙科兼容入口。新通用核心应优先使用 matchAuthorizedFaq + 行业包约束。
 */
export function matchClinicFaq(input: {
  clinicId: string;
  channel: FaqChannel;
  text: string;
  entries: readonly ClinicFaqEntry[];
  threshold?: number;
}): FaqMatch {
  return matchAuthorizedFaq({
    tenantId: input.clinicId,
    channel: input.channel,
    text: input.text,
    entries: input.entries,
    blockedPatterns: MEDICAL_ADVICE_PATTERNS,
    blockedReason: "MEDICAL_ADVICE_REQUEST_REQUIRES_HUMAN",
    ...(input.threshold === undefined ? {} : { threshold: input.threshold }),
  });
}
