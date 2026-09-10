import type { PrivacyParty } from "@/privacy-broker/types";

export type JobConversationState = "agent_handling" | "waiting_human" | "human_only" | "closed";
export type JobMessageFrom = "customer" | "worker" | "customer_agent" | "worker_agent" | "human";

export type ConversationIntentKind =
  | "ASK_AVAILABILITY"
  | "CHANGE_TIME"
  | "REQUEST_INFORMATION"
  | "PRICE_QUERY"
  | "REQUEST_PHOTO"
  | "DELAY_NOTIFICATION"
  | "ARRIVAL_NOTICE"
  | "CANCEL_REQUEST"
  | "RESCHEDULE_REQUEST"
  | "SERVICE_COMPLETE"
  | "REQUEST_PRIVATE_CONTACT"
  | "UNKNOWN";

export interface ConversationIntent {
  intentId: string;
  jobId: string;
  actor: "customer" | "worker";
  kind: ConversationIntentKind;
  requestedStartAt?: string;
  textDigest: string;
  createdAt: string;
}

export interface AlternativeTimeProposal {
  proposalId: string;
  jobId: string;
  workerId: string;
  proposedStartAt: string;
  proposedEndAt: string;
  reason: string;
  status: "proposed" | "accepted" | "declined";
  createdAt: string;
}

export interface JobConversationMessage {
  messageId: string;
  from: JobMessageFrom;
  text: string;
  at: string;
  intentId?: string;
}

export interface JobConversation {
  conversationId: string;
  tenantId: string;
  verticalId: string;
  jobId: string;
  customerIdentity: string;
  workerIdentity: string;
  state: JobConversationState;
  messages: JobConversationMessage[];
  intents: ConversationIntent[];
  proposals: AlternativeTimeProposal[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationPolicyDecision {
  allowed: boolean;
  requiresHuman: boolean;
  action:
    | "ROUTE_TO_WORKER_AGENT"
    | "ROUTE_TO_CUSTOMER_AGENT"
    | "CREATE_TIME_CHANGE_REQUEST"
    | "CREATE_ALTERNATIVE_TIME_PROPOSAL"
    | "ANSWER_FROM_JOB_CONTEXT"
    | "BLOCK_PRIVATE_CONTACT"
    | "HANDOFF_TO_HUMAN"
    | "NO_ACTION";
  reasonCode: string;
  reason: string;
}

export interface JobAgentRequestResult {
  conversation: JobConversation;
  intent: ConversationIntent | null;
  policy: ConversationPolicyDecision;
}

export interface AgentCommunicationActor {
  party: "customer" | "worker";
  id: string;
  privacyParty: PrivacyParty;
}
