import { PrivacyBroker } from "@/privacy-broker/broker";
import type {
  AgentCommunicationActor,
  AlternativeTimeProposal,
  ConversationIntent,
  ConversationIntentKind,
  ConversationPolicyDecision,
  JobAgentRequestResult,
  JobConversation,
} from "@/agent-communication/types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function classifyIntent(text: string): ConversationIntentKind {
  const normalized = text.toLocaleLowerCase("zh-HK");
  if (
    /私人.*(電話|电话|号码|號碼)|電話.*(師傅|师傅|客戶|客户)|号码.*(客户|客戶)|(?:客户|客戶|师傅|師傅|所有).*?(?:電話|电话|号码|號碼)/u.test(
      normalized,
    )
  ) {
    return "REQUEST_PRIVATE_CONTACT";
  }
  if (/取消|cancel/u.test(normalized)) return "CANCEL_REQUEST";
  if (/改期|改時間|改时间|改到|換時間|换时间|reschedule/u.test(normalized)) return "CHANGE_TIME";
  if (/幾點得|几点得|有冇位|有没有位|availability|空檔|空档/u.test(normalized))
    return "ASK_AVAILABILITY";
  if (/價錢|价钱|幾錢|多少钱|報價|报价|price/u.test(normalized)) return "PRICE_QUERY";
  if (/相片|照片|圖片|图片|photo/u.test(normalized)) return "REQUEST_PHOTO";
  if (/遲到|延遲|延迟|delay/u.test(normalized)) return "DELAY_NOTIFICATION";
  if (/到咗|到了|arrived/u.test(normalized)) return "ARRIVAL_NOTICE";
  if (/完成|完工|complete|done/u.test(normalized)) return "SERVICE_COMPLETE";
  if (/重新安排|再約|再约|reschedule/u.test(normalized)) return "RESCHEDULE_REQUEST";
  if (/問下|问下|想知道|可否|可以嗎|可以吗|information/u.test(normalized))
    return "REQUEST_INFORMATION";
  return "UNKNOWN";
}

function riskNeedsHuman(text: string): boolean {
  return /投訴|投诉|爭議|争议|安全|身份|身分|不滿|不满|威脅|威胁|騙|骗/u.test(text);
}

function parseRequestedTime(text: string): string | undefined {
  const match = text.match(/(?:到|改到|約|约|在|at)\s*(\d{1,2})(?::(\d{2}))?/iu);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "00");
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59)
    return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function policyForIntent(
  actor: AgentCommunicationActor["party"],
  state: JobConversation["state"],
  kind: ConversationIntentKind,
  privateContactBlocked: boolean,
  risky: boolean,
): ConversationPolicyDecision {
  if (state === "human_only" || state === "closed") {
    return {
      allowed: false,
      requiresHuman: true,
      action: "HANDOFF_TO_HUMAN",
      reasonCode: "HUMAN_ONLY_STATE",
      reason: "Agent automation is paused for this Job conversation.",
    };
  }
  if (privateContactBlocked || kind === "REQUEST_PRIVATE_CONTACT") {
    return {
      allowed: false,
      requiresHuman: true,
      action: "BLOCK_PRIVATE_CONTACT",
      reasonCode: "PRIVATE_CONTACT_NOT_DISCLOSED",
      reason: "The platform keeps private phone numbers behind the Privacy Broker.",
    };
  }
  if (risky) {
    return {
      allowed: false,
      requiresHuman: true,
      action: "HANDOFF_TO_HUMAN",
      reasonCode: "HIGH_RISK_CONVERSATION",
      reason: "Complaints, safety, identity and disputes require human handling.",
    };
  }
  if (kind === "CHANGE_TIME" || kind === "RESCHEDULE_REQUEST") {
    return {
      allowed: true,
      requiresHuman: false,
      action:
        actor === "customer" ? "CREATE_TIME_CHANGE_REQUEST" : "CREATE_ALTERNATIVE_TIME_PROPOSAL",
      reasonCode: "STRUCTURED_TIME_INTENT",
      reason: "The time change is represented as a Job-scoped intent before any schedule mutation.",
    };
  }
  if (actor === "customer") {
    return {
      allowed: true,
      requiresHuman: false,
      action: "ROUTE_TO_WORKER_AGENT",
      reasonCode: "CUSTOMER_TO_WORKER_AGENT",
      reason: "The request is routed through the platform Job conversation.",
    };
  }
  return {
    allowed: true,
    requiresHuman: false,
    action: "ROUTE_TO_CUSTOMER_AGENT",
    reasonCode: "WORKER_TO_CUSTOMER_AGENT",
    reason: "The response is routed through the platform Job conversation.",
  };
}

/**
 * Conversation Core compiles bounded natural-language requests into an intent
 * before a policy can select an action. It has no channel send capability and
 * therefore cannot bypass the WhatsApp policy gate.
 */
export class JobConversationCore {
  private conversation: JobConversation;

  constructor(
    input: {
      tenantId: string;
      verticalId: string;
      jobId: string;
      customerIdentity: string;
      workerIdentity: string;
      now?: string;
    },
    private readonly privacyBroker?: PrivacyBroker,
  ) {
    const now = input.now ?? new Date().toISOString();
    this.conversation = {
      conversationId: makeId("jobconv"),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      jobId: input.jobId,
      customerIdentity: input.customerIdentity,
      workerIdentity: input.workerIdentity,
      state: "agent_handling",
      messages: [],
      intents: [],
      proposals: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  snapshot(): JobConversation {
    return clone(this.conversation);
  }

  setHumanOnly(now = new Date().toISOString()): JobConversation {
    this.conversation.state = "human_only";
    this.conversation.updatedAt = now;
    return this.snapshot();
  }

  humanTakeover(now = new Date().toISOString()): JobConversation {
    this.conversation.state = "human_only";
    this.conversation.updatedAt = now;
    return this.snapshot();
  }

  resumeAgent(now = new Date().toISOString()): JobConversation {
    if (this.conversation.state !== "closed") this.conversation.state = "agent_handling";
    this.conversation.updatedAt = now;
    return this.snapshot();
  }

  close(now = new Date().toISOString()): JobConversation {
    this.conversation.state = "closed";
    this.conversation.updatedAt = now;
    return this.snapshot();
  }

  canAgentReply(): boolean {
    return this.conversation.state === "agent_handling";
  }

  processMessage(input: {
    actor: AgentCommunicationActor;
    text: string;
    now?: string;
    requestedStartAt?: string;
  }): JobAgentRequestResult {
    const now = input.now ?? new Date().toISOString();
    const kind = classifyIntent(input.text);
    const requestedStartAt = input.requestedStartAt ?? parseRequestedTime(input.text);
    const intent: ConversationIntent = {
      intentId: makeId("intent"),
      jobId: this.conversation.jobId,
      actor: input.actor.party,
      kind,
      ...(requestedStartAt ? { requestedStartAt } : {}),
      textDigest: `intent:${kind}`,
      createdAt: now,
    };
    this.conversation.intents.push(intent);
    this.conversation.messages.push({
      messageId: makeId("jobmsg"),
      from: input.actor.party,
      text: input.text.trim(),
      at: now,
      intentId: intent.intentId,
    });

    let privateContactBlocked = false;
    if (kind === "REQUEST_PRIVATE_CONTACT") {
      const target = input.actor.party === "customer" ? "worker" : "customer";
      const disclosure = this.privacyBroker?.requestDisclosure({
        jobId: this.conversation.jobId,
        tenantId: this.conversation.tenantId,
        verticalId: this.conversation.verticalId,
        requester: input.actor.privacyParty,
        requesterId: input.actor.id,
        target,
        capability: "job.private_phone.read",
        stage: "manual",
        purpose: "support",
        now,
      });
      privateContactBlocked = !disclosure?.allowed;
    }

    const policy = policyForIntent(
      input.actor.party,
      this.conversation.state,
      kind,
      privateContactBlocked,
      riskNeedsHuman(input.text),
    );
    if (policy.requiresHuman && this.conversation.state !== "human_only") {
      this.conversation.state = "waiting_human";
    }
    this.conversation.updatedAt = now;
    return { conversation: this.snapshot(), intent, policy };
  }

  addAlternativeTimeProposal(input: {
    workerId: string;
    proposedStartAt: string;
    proposedEndAt: string;
    reason: string;
    now?: string;
  }): AlternativeTimeProposal {
    if (this.conversation.state === "human_only" || this.conversation.state === "closed") {
      throw new Error("HUMAN_ONLY_CONVERSATION");
    }
    const now = input.now ?? new Date().toISOString();
    const proposal: AlternativeTimeProposal = {
      proposalId: makeId("proposal"),
      jobId: this.conversation.jobId,
      workerId: input.workerId,
      proposedStartAt: input.proposedStartAt,
      proposedEndAt: input.proposedEndAt,
      reason: input.reason,
      status: "proposed",
      createdAt: now,
    };
    this.conversation.proposals.push(proposal);
    this.conversation.updatedAt = now;
    return clone(proposal);
  }
}
