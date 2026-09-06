import type { AgentTask, AgentTaskStatus, RiskLevel } from "@/types/domain";

/**
 * Agent 任務狀態機。
 * 原則：高風險動作永不自動執行，必須由具 agent.approve 權限的人員批准。
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

/** 高風險任務不可自動執行 */
export function mayAutoExecute(task: Pick<AgentTask, "risk">): boolean {
  return task.risk !== "high";
}

export function initialStatusFor(risk: RiskLevel): AgentTaskStatus {
  return risk === "high" ? "waiting_approval" : "auto_running";
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
