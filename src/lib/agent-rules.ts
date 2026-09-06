import type { AgentTask, AgentTaskStatus, RiskLevel } from "@/types/domain";

/**
 * Agent 任務狀態機。
 *
 * 安全基线：
 * - low：可按诊所策略自动执行；
 * - medium / high：默认必须人工批准；
 * - 医学诊断、治疗建议、临床分诊不属于本系统可执行动作集合。
 */
export const AGENT_TRANSITIONS: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  auto_running: ["done", "failed", "waiting_approval"],
  waiting_approval: ["done", "rejected", "failed"],
  failed: ["waiting_approval"],
  done: [],
  rejected: [],
};

export function canTransitionAgentTask(from: AgentTaskStatus, to: AgentTaskStatus): boolean {
  return AGENT_TRANSITIONS[from].includes(to);
}

/**
 * 只有低风险行政动作可以自动执行。
 * medium 也进入人工门，避免「改期／取消／文件写入」之类外部副作用被默认放行。
 */
export function mayAutoExecute(task: Pick<AgentTask, "risk">): boolean {
  return task.risk === "low";
}

export function initialStatusFor(risk: RiskLevel): AgentTaskStatus {
  return mayAutoExecute({ risk }) ? "auto_running" : "waiting_approval";
}

/**
 * 潛在緊急標記：純關鍵詞／規則比對。
 * 明確不做醫學診斷、不輸出分流結論、不建議治療。
 */
export interface UrgentMatch {
  matched: string[];
  rule: string | null;
}

export function detectUrgent(text: string, keywords: string[]): UrgentMatch {
  const matched = keywords.filter((k) => text.includes(k));
  if (matched.length === 0) return { matched, rule: null };
  const rule =
    matched.length >= 2
      ? `關鍵詞規則：同時命中 ${matched.length} 個潛在緊急字詞`
      : "關鍵詞規則：命中 1 個潛在緊急字詞";
  return { matched, rule };
}
