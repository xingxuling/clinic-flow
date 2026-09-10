import { PrivacyBroker } from "@/privacy/broker";
import {
  detectCustomerControlCommand,
  messagingAutomationControlRepository,
  type BrowserMessagingAutomationControlRepository,
} from "@/messaging/automation-control";
import type { ChannelKind } from "@/types/domain";
import type { DataCapability } from "@/privacy/types";
import type { JobConversation } from "@/scheduling/types";
import type { SchedulingRepository } from "@/scheduling/repository";

export type JobAgentSide = "customer" | "worker";
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
  | "REQUEST_HUMAN"
  | "WHATSAPP_OPTOUT"
  | "UNRESOLVED";

export interface ConversationIntent {
  intentId: string;
  jobId: string;
  from: JobAgentSide;
  to: JobAgentSide;
  kind: ConversationIntentKind;
  parameters: Record<string, string>;
  sourceText: string;
  status: "proposed" | "blocked" | "awaiting_human" | "ready_for_policy";
  createdAt: string;
}

export interface JobAgentMessageResult {
  ok: boolean;
  intent: ConversationIntent | null;
  blocked: boolean;
  requiresHuman: boolean;
  reply: string;
  privacyCode?: string;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractTime(text: string): string | null {
  const western = /(\d{1,2})(?::(\d{2}))?\s*(?:點|点|時|时)?/.exec(text);
  if (!western) return null;
  const hour = Number(western[1]);
  const minute = western[2] ? Number(western[2]) : 0;
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;
}

export function compileConversationIntent(input: {
  jobId: string;
  from: JobAgentSide;
  text: string;
  now?: Date;
}): ConversationIntent {
  const text = input.text.trim();
  const normalized = text.toLocaleLowerCase("zh-HK");
  let kind: ConversationIntentKind = "UNRESOLVED";
  const parameters: Record<string, string> = {};
  if (/^\s*stop\s*$/iu.test(normalized)) kind = "WHATSAPP_OPTOUT";
  else if (
    /人工|真人|不要\s*(ai|agent|機器人|机器人)|停止\s*(ai|agent|機器人|机器人)/iu.test(normalized)
  )
    kind = "REQUEST_HUMAN";
  else if (/電話|电话|號碼|号码|phone|contact/iu.test(normalized)) {
    kind = "REQUEST_INFORMATION";
    parameters["field"] = input.from === "customer" ? "worker.phone" : "customer.phone";
  } else if (/改期|改到|改為|改为|改時間|改时间|轉時間|转时间|換日子|换日子/iu.test(normalized)) {
    kind = "CHANGE_TIME";
    const time = extractTime(normalized);
    if (time) parameters["requestedTime"] = time;
  } else if (/有冇位|有空|available|可唔可以/iu.test(normalized)) kind = "ASK_AVAILABILITY";
  else if (/幾錢|几钱|價錢|价钱|報價|报价|price/iu.test(normalized)) kind = "PRICE_QUERY";
  else if (/相片|照片|圖片|图片|photo/iu.test(normalized)) kind = "REQUEST_PHOTO";
  else if (/遲到|迟到|延遲|延迟|delay/iu.test(normalized)) kind = "DELAY_NOTIFICATION";
  else if (/到達|到达|到場|到场|arriv/iu.test(normalized)) kind = "ARRIVAL_NOTICE";
  else if (/取消|唔做|不做|cancel/iu.test(normalized)) kind = "CANCEL_REQUEST";
  else if (/改期|reschedule/iu.test(normalized)) kind = "RESCHEDULE_REQUEST";
  else if (/完成|做完|complete|finished/iu.test(normalized)) kind = "SERVICE_COMPLETE";
  return {
    intentId: makeId("intent"),
    jobId: input.jobId,
    from: input.from,
    to: input.from === "customer" ? "worker" : "customer",
    kind,
    parameters,
    sourceText: text,
    status: kind === "UNRESOLVED" ? "awaiting_human" : "proposed",
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}

function privacyCapabilityFor(intent: ConversationIntent): DataCapability | null {
  if (intent.kind !== "REQUEST_INFORMATION") return null;
  const field = intent.parameters["field"];
  if (field === "worker.phone" || field === "customer.phone") return field;
  return null;
}

export class JobAgentCommunicationRuntime {
  constructor(
    private readonly repository: SchedulingRepository,
    private readonly privacyBroker: PrivacyBroker,
    private readonly controls: BrowserMessagingAutomationControlRepository = messagingAutomationControlRepository,
  ) {}

  handle(input: {
    tenantId: string;
    verticalId: string;
    jobId: string;
    from: JobAgentSide;
    actorId: string;
    text: string;
    channel?: ChannelKind;
    now?: Date;
  }): JobAgentMessageResult {
    const job = this.repository.getJob(input.tenantId, input.verticalId, input.jobId);
    if (!job)
      return {
        ok: false,
        intent: null,
        blocked: true,
        requiresHuman: true,
        reply: "找不到当前 Job，已转人工处理。",
      };
    if (
      (input.from === "customer" && job.customerId !== input.actorId) ||
      (input.from === "worker" && job.workerId !== input.actorId)
    ) {
      return {
        ok: false,
        intent: null,
        blocked: true,
        requiresHuman: true,
        reply: "参与者身份无法验证，已转人工处理。",
      };
    }
    const conversation = this.repository.getJobConversation(
      input.tenantId,
      input.verticalId,
      job.conversationId,
    );
    if (!conversation)
      return {
        ok: false,
        intent: null,
        blocked: true,
        requiresHuman: true,
        reply: "当前 Job 对话不存在，已转人工处理。",
      };
    if (
      conversation.humanTakeover ||
      (input.from === "customer" ? conversation.customerPaused : conversation.workerPaused) ||
      conversation.state === "human_only"
    ) {
      return {
        ok: false,
        intent: null,
        blocked: true,
        requiresHuman: true,
        reply: "当前对话已由人工处理，Agent 不会继续自动回复。",
      };
    }

    const compiledIntent = compileConversationIntent({
      jobId: input.jobId,
      from: input.from,
      text: input.text,
      ...(input.now ? { now: input.now } : {}),
    });
    const channelControl =
      input.channel === "whatsapp" && input.from === "customer"
        ? detectCustomerControlCommand(input.text)
        : "none";
    const intent: ConversationIntent =
      channelControl === "whatsapp_opt_out"
        ? { ...compiledIntent, kind: "WHATSAPP_OPTOUT" }
        : compiledIntent;
    if (intent.kind === "REQUEST_HUMAN") {
      const next: JobConversation = {
        ...conversation,
        state: "human_only",
        humanTakeover: true,
        updatedAt: (input.now ?? new Date()).toISOString(),
      };
      this.repository.saveJobConversation(next);
      if (input.from === "customer")
        this.controls.setHumanOnly({
          tenantId: input.tenantId,
          verticalId: input.verticalId,
          customerId: job.customerId,
          reason: "JOB_AGENT_REQUEST_HUMAN",
        });
      return {
        ok: true,
        intent: { ...intent, status: "awaiting_human" },
        blocked: false,
        requiresHuman: true,
        reply: "已暂停 Agent，并交由人工处理。",
      };
    }

    if (intent.kind === "WHATSAPP_OPTOUT") {
      if (input.channel !== "whatsapp" || input.from !== "customer") {
        return {
          ok: false,
          intent: { ...intent, status: "blocked" },
          blocked: true,
          requiresHuman: true,
          reply: "这个控制指令只会在 WhatsApp 客户通道内生效，已转人工确认。",
        };
      }
      this.controls.optOutWhatsApp({
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        customerId: job.customerId,
        at: (input.now ?? new Date()).toISOString(),
      });
      this.repository.saveJobConversation({
        ...conversation,
        state: "human_only",
        humanTakeover: true,
        updatedAt: (input.now ?? new Date()).toISOString(),
      });
      return {
        ok: true,
        intent: { ...intent, status: "awaiting_human" },
        blocked: false,
        requiresHuman: true,
        reply: "已停止 WhatsApp 自动消息，并交由人工处理。",
      };
    }

    const capability = privacyCapabilityFor(intent);
    if (capability) {
      const access = this.privacyBroker.requestAccess({
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        contextId: job.privacyContextId,
        viewer: input.from === "customer" ? "customer_agent" : "worker_agent",
        capability,
        purpose: "contact_exchange",
        consented: false,
        ...(input.now ? { now: input.now } : {}),
        viewerSubjectId: input.actorId,
      });
      if (!access.allowed)
        return {
          ok: false,
          intent: { ...intent, status: "blocked" },
          blocked: true,
          requiresHuman: access.code === "CAPABILITY_NOT_ALLOWED" ? false : true,
          reply:
            "为保护双方私隐，这项私人联络资料不会由 Agent 直接提供；如业务确实需要，请交由人工按政策处理。",
          privacyCode: access.code,
        };
    }

    if (intent.kind === "UNRESOLVED")
      return {
        ok: false,
        intent,
        blocked: false,
        requiresHuman: true,
        reply: "我未能安全理解这项要求，已交由人工处理。",
      };
    const next: JobConversation = {
      ...conversation,
      updatedAt: (input.now ?? new Date()).toISOString(),
    };
    this.repository.saveJobConversation(next);
    return {
      ok: true,
      intent: { ...intent, status: "ready_for_policy" },
      blocked: false,
      requiresHuman: false,
      reply: this.replyFor(intent),
    };
  }

  pause(input: {
    tenantId: string;
    verticalId: string;
    jobId: string;
    side: JobAgentSide;
  }): boolean {
    return this.updateConversation(
      input,
      input.side === "customer" ? { customerPaused: true } : { workerPaused: true },
    );
  }

  resume(input: {
    tenantId: string;
    verticalId: string;
    jobId: string;
    side: JobAgentSide;
  }): boolean {
    return this.updateConversation(
      input,
      input.side === "customer" ? { customerPaused: false } : { workerPaused: false },
    );
  }

  takeOver(input: { tenantId: string; verticalId: string; jobId: string }): boolean {
    return this.updateConversation(input, { humanTakeover: true, state: "human_only" });
  }

  private updateConversation(
    input: { tenantId: string; verticalId: string; jobId: string },
    patch: Partial<JobConversation>,
  ): boolean {
    const job = this.repository.getJob(input.tenantId, input.verticalId, input.jobId);
    if (!job) return false;
    const conversation = this.repository.getJobConversation(
      input.tenantId,
      input.verticalId,
      job.conversationId,
    );
    if (!conversation) return false;
    this.repository.saveJobConversation({
      ...conversation,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  private replyFor(intent: ConversationIntent): string {
    switch (intent.kind) {
      case "CHANGE_TIME":
        return intent.parameters["requestedTime"]
          ? `已收到改时间要求：${intent.parameters["requestedTime"]}，我会先交给另一方 Agent 检查档期。`
          : "已收到改时间要求，我会先交给另一方 Agent 检查档期。";
      case "ASK_AVAILABILITY":
        return "我会根据当前 Job 的服务能力、地区与档期查询可选时段。";
      case "PRICE_QUERY":
        return "价格需要按当前服务范围由商户确认，已保留为待处理意图。";
      case "REQUEST_PHOTO":
        return "请通过当前平台对话上传相关照片，Agent 只会把它关联到当前 Job。";
      case "DELAY_NOTIFICATION":
        return "已记录延迟通知，并会在当前 Job 对话内同步。";
      case "ARRIVAL_NOTICE":
        return "已记录到场通知。";
      case "CANCEL_REQUEST":
        return "已记录取消要求，取消动作会按预约状态机处理。";
      case "RESCHEDULE_REQUEST":
        return "已记录改期要求，待排程策略确认。";
      case "SERVICE_COMPLETE":
        return "已记录服务完成意图，待确认后更新 Job。";
      case "WHATSAPP_OPTOUT":
        return "已停止 WhatsApp 自动消息。";
      default:
        return "已收到当前 Job 的服务请求。";
    }
  }
}
