import {
  serviceConversationRepository,
  type BrowserServiceConversationRepository,
} from "@/conversations/repository";
import type { ServiceConversation } from "@/conversations/types";
import type { ServiceTenant } from "@/core/tenant";
import {
  processServiceFrontdeskInboundMessage,
  type FrontdeskInboundReceipt,
  type IncomingServiceMessage,
} from "@/frontdesk/inbound-service";
import type { MessagingAdapter } from "@/integrations/messaging-adapter";
import {
  detectCustomerControlCommand,
  messagingAutomationControlRepository,
  type BrowserMessagingAutomationControlRepository,
} from "@/messaging/automation-control";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface ServiceConversationIngestReceipt {
  duplicate: boolean;
  persisted: boolean;
  conversation: ServiceConversation | null;
  frontdesk: FrontdeskInboundReceipt | null;
  state: ServiceConversation["state"] | null;
  errors: string[];
}

function requiresHuman(receipt: FrontdeskInboundReceipt): boolean {
  if (receipt.decision.requiresHuman || receipt.humanTaskRequired) return true;
  if (receipt.autoReplyAttempted && !receipt.autoReplyReceipt?.ok) return true;

  const replyWasExpected =
    receipt.decision.autoSendAllowed && Boolean(receipt.decision.suggestedReply);
  if (replyWasExpected && !receipt.autoReplyAttempted) return true;

  return false;
}

/**
 * 通用消息摄入层：
 * - webhook/provider message id 先做幂等检查，避免重复调用 Agent / 重复发送；
 * - 客户可随时要求转人工或停止 WhatsApp 通讯，控制状态先于 Agent 决策生效；
 * - 商户全局暂停 Agent 后，所有新消息直接进入 waiting_human；
 * - production=true 时 WhatsApp 只允许官方 Business Platform provider；
 * - 只有真实发送成功的自动回复才写入 Conversation；
 * - 高优先安全信号保留客户原话、触发关键词和决策原因，刷新后仍可审计。
 */
export class ServiceConversationIngestRuntime {
  constructor(
    private readonly repository: BrowserServiceConversationRepository = serviceConversationRepository,
    private readonly controls: BrowserMessagingAutomationControlRepository = messagingAutomationControlRepository,
  ) {}

  async ingest(input: {
    tenant: ServiceTenant;
    vertical: ServiceVerticalPack;
    message: IncomingServiceMessage;
    customerName: string;
    messagingAdapter: MessagingAdapter;
    production?: boolean;
  }): Promise<ServiceConversationIngestReceipt> {
    if (input.message.tenantId !== input.tenant.id) {
      const frontdesk = await processServiceFrontdeskInboundMessage({
        tenant: input.tenant,
        vertical: input.vertical,
        message: input.message,
        messagingAdapter: input.messagingAdapter,
      });
      return {
        duplicate: false,
        persisted: false,
        conversation: null,
        frontdesk,
        state: null,
        errors: ["TENANT_MISMATCH_NOT_PERSISTED"],
      };
    }

    const existing = this.repository.findByProviderMessageId(
      input.tenant.id,
      input.vertical.id,
      input.message.providerMessageId,
    );
    if (existing) {
      return {
        duplicate: true,
        persisted: false,
        conversation: existing,
        frontdesk: null,
        state: existing.state,
        errors: [],
      };
    }

    this.controls.recordCustomerMessage({
      tenantId: input.tenant.id,
      verticalId: input.vertical.id,
      customerId: input.message.customerId,
      at: input.message.receivedAt,
    });

    const command = detectCustomerControlCommand(input.message.text);
    if (command === "whatsapp_opt_out") {
      this.controls.optOutWhatsApp({
        tenantId: input.tenant.id,
        verticalId: input.vertical.id,
        customerId: input.message.customerId,
        at: input.message.receivedAt,
        updatedBy: "customer",
      });
    } else if (command === "human_only") {
      this.controls.setHumanOnly({
        tenantId: input.tenant.id,
        verticalId: input.vertical.id,
        customerId: input.message.customerId,
        reason: "CUSTOMER_REQUESTED_HUMAN",
        updatedBy: "customer",
      });
    }

    const tenantControl = this.controls.getTenant(input.tenant.id);
    const customerControl = this.controls.getCustomer(
      input.tenant.id,
      input.vertical.id,
      input.message.customerId,
    );

    const productionProviderBlocked =
      Boolean(input.production) &&
      input.message.channel === "whatsapp" &&
      (input.messagingAdapter.providerKind !== "whatsapp_business_platform" ||
        !input.messagingAdapter.productionEligible);

    const automationBlocked =
      command !== "none" ||
      !tenantControl.agentEnabled ||
      customerControl.automationMode === "human_only" ||
      productionProviderBlocked;

    if (automationBlocked) {
      const reason =
        command === "whatsapp_opt_out"
          ? "CUSTOMER_WHATSAPP_OPT_OUT"
          : command === "human_only"
            ? "CUSTOMER_REQUESTED_HUMAN"
            : !tenantControl.agentEnabled
              ? "TENANT_AGENT_PAUSED"
              : customerControl.automationMode === "human_only"
                ? "CUSTOMER_HUMAN_ONLY"
                : "WHATSAPP_BUSINESS_PLATFORM_REQUIRED";

      const conversation = this.repository.appendMessage({
        tenantId: input.tenant.id,
        verticalId: input.vertical.id,
        customerId: input.message.customerId,
        channel: input.message.channel,
        from: "customer",
        authorName: input.customerName,
        text: input.message.text,
        at: input.message.receivedAt,
        providerMessageId: input.message.providerMessageId,
        subject:
          command === "whatsapp_opt_out"
            ? "客戶要求停止 WhatsApp 訊息"
            : command === "human_only"
              ? "客戶要求人工處理"
              : "等待人工處理",
        state: "waiting_human",
        unread: true,
      });

      return {
        duplicate: false,
        persisted: true,
        conversation,
        frontdesk: null,
        state: "waiting_human",
        errors: [reason],
      };
    }

    const frontdesk = await processServiceFrontdeskInboundMessage({
      tenant: input.tenant,
      vertical: input.vertical,
      message: input.message,
      messagingAdapter: input.messagingAdapter,
    });

    const humanRequired = requiresHuman(frontdesk);
    const state: ServiceConversation["state"] = humanRequired
      ? "waiting_human"
      : "agent_handling";

    let conversation = this.repository.appendMessage({
      tenantId: input.tenant.id,
      verticalId: input.vertical.id,
      customerId: input.message.customerId,
      channel: input.message.channel,
      from: "customer",
      authorName: input.customerName,
      text: input.message.text,
      at: input.message.receivedAt,
      providerMessageId: input.message.providerMessageId,
      subject: frontdesk.decision.summary,
      state,
      unread: humanRequired,
    });

    if (
      frontdesk.decision.kind === "urgent_handoff" ||
      frontdesk.decision.matchedUrgentKeywords.length > 0
    ) {
      conversation =
        this.repository.update(input.tenant.id, conversation.id, {
          safetySignal: {
            quote: input.message.text,
            matchedKeywords: [...frontdesk.decision.matchedUrgentKeywords],
            reasons: [...frontdesk.decision.reasons],
            raisedAt: input.message.receivedAt,
          },
        }) ?? conversation;
    }

    const sent = frontdesk.autoReplyReceipt;
    if (
      frontdesk.autoReplyAttempted &&
      sent?.ok &&
      frontdesk.decision.suggestedReply
    ) {
      conversation = this.repository.appendMessage({
        tenantId: input.tenant.id,
        verticalId: input.vertical.id,
        customerId: input.message.customerId,
        channel: input.message.channel,
        from: "agent",
        authorName: "Service Frontdesk Agent",
        text: frontdesk.decision.suggestedReply,
        at: sent.sentAt,
        ...(sent.providerMessageId ? { providerMessageId: sent.providerMessageId } : {}),
        state: "agent_handling",
        unread: false,
      });
    }

    return {
      duplicate: false,
      persisted: true,
      conversation,
      frontdesk,
      state: conversation.state,
      errors: [],
    };
  }
}

export const serviceConversationIngestRuntime = new ServiceConversationIngestRuntime();
