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
 * - Frontdesk Core 仍只负责决策与通道动作；
 * - 只有真实发送成功的自动回复才写入 Conversation；
 * - 需要人工、发送失败或缺少匹配 Adapter 时统一进入 waiting_human。
 */
export class ServiceConversationIngestRuntime {
  constructor(
    private readonly repository: BrowserServiceConversationRepository = serviceConversationRepository,
  ) {}

  async ingest(input: {
    tenant: ServiceTenant;
    vertical: ServiceVerticalPack;
    message: IncomingServiceMessage;
    customerName: string;
    messagingAdapter: MessagingAdapter;
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
