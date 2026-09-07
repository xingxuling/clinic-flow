export interface EscalationMatch {
  matched: string[];
  rule: string | null;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("zh-HK").replace(/\s+/g, "").trim();
}

/**
 * 通用服务行业升级信号匹配器。
 *
 * 它只回答“是否命中商户配置的高优先级关键词”，不回答原因、诊断、维修方案或专业结论。
 */
export function matchEscalationKeywords(
  text: string,
  keywords: readonly string[],
): EscalationMatch {
  const normalized = normalize(text);
  const matched = keywords.filter((keyword) => normalized.includes(normalize(keyword)));
  if (matched.length === 0) return { matched: [], rule: null };
  return {
    matched,
    rule:
      matched.length === 1
        ? "ESCALATION_KEYWORD_MATCH_1"
        : `ESCALATION_KEYWORD_MATCH_${matched.length}`,
  };
}

export function matchesRestrictedQuestion(
  text: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
