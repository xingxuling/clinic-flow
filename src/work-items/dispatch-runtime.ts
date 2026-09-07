import {
  serviceConversationRepository,
  type BrowserServiceConversationRepository,
} from "@/conversations/repository";
import type { ServiceConversation } from "@/conversations/types";
import type { ServiceCustomer } from "@/customers/types";
import type { ChannelSendReceipt, MessagingAdapter } from "@/integrations/messaging-adapter";
import {
  messagingAutomationControlRepository,
  type BrowserMessagingAutomationControlRepository,
} from "@/messaging/automation-control";
import { evaluateWhatsAppPolicy } from "@/messaging/whatsapp-policy";
import {
  serviceWorkItemRepository,
  type BrowserServiceWorkItemRepository,
} from "@/work-items/repository";
import type { ServiceMessagePurpose, ServiceWorkItem } from "@/work-items/types";

export interface ServiceWorkItemDispatchResult {
  ok: boolean;
  duplicate: boolean;
  workItem: ServiceWorkItem | null;
  sendReceipt: ChannelSendReceipt | null;
  conversation: ServiceConversation | null;
  errorCode: string | null;
}

const DISPATCHABLE_KINDS = new Set<ServiceWorkItem["kind"]>([
  "follow_up_message",
  "booking_reminder",
]);

function inferredPurpose(item: ServiceWorkItem): ServiceMessagePurpose {
  if (item.messagePurpose) return item.messagePurpose;
  return item.kind === "booking_reminder" ? "utility" : "marketing";
}

/**
 * 已批准工作项的通道执行层。
 *
 * WhatsApp 主动发送必须先通过：
 * - 客户 opt-in / message category scope；
 * - 商户 Agent 总开关与客户 human-only 开关；
 * - 24 小时 customer-service window；
 * - 超窗 approved template；
 * - production 环境只允许 WhatsApp Business Platform provider。
 *
 * 真实 send 成功后先固化 provider receipt，再投影 Conversation；重试不会二次发送。
 */
export class ServiceWorkItemDispatchRuntime {
  constructor(
    private readonly workItems: BrowserServiceWorkItemRepository = serviceWorkItemRepository,
    private readonly conversations: BrowserServiceConversationRepository = serviceConversationRepository,
    private readonly controls: BrowserMessagingAutomationControlRepository = messagingAutomationControlRepository,
  ) {}

  async dispatch(input: {
    tenantId: string;
    verticalId: string;
    workItemId: string;
    customer: ServiceCustomer;
    adapter: MessagingAdapter;
    production?: boolean;
  }): Promise<ServiceWorkItemDispatchResult> {
    const item = this.workItems.get(input.tenantId, input.workItemId);
    if (!item) {
      return { ok: false, duplicate: false, workItem: null, sendReceipt: null, conversation: null, errorCode: "WORK_ITEM_NOT_FOUND" };
    }
    if (item.verticalId !== input.verticalId || input.customer.verticalId !== input.verticalId) {
      return { ok: false, duplicate: false, workItem: item, sendReceipt: null, conversation: null, errorCode: "VERTICAL_MISMATCH" };
    }
    if (item.customerId && item.customerId !== input.customer.id) {
      return { ok: false, duplicate: false, workItem: item, sendReceipt: null, conversation: null, errorCode: "CUSTOMER_MISMATCH" };
    }
    if (!DISPATCHABLE_KINDS.has(item.kind) || !item.proposedMessage?.trim()) {
      return { ok: false, duplicate: false, workItem: item, sendReceipt: null, conversation: null, errorCode: "WORK_ITEM_NOT_DISPATCHABLE" };
    }
    if (input.adapter.channel !== input.customer.preferredChannel) {
      return { ok: false, duplicate: false, workItem: item, sendReceipt: null, conversation: null, errorCode: "CHANNEL_ADAPTER_MISMATCH" };
    }

    // 已成功发送的任务只允许修补本地 Conversation 投影，不再经过外部 send。
    if (item.status === "done" && item.dispatchReceipt) {
      let conversation = item.dispatchReceipt.providerMessageId
        ? this.conversations.findByProviderMessageId(
            input.tenantId,
            input.verticalId,
            item.dispatchReceipt.providerMessageId,
          )
        : null;
      if (!conversation) {
        conversation = this.conversations.appendMessage({
          tenantId: input.tenantId,
          verticalId: input.verticalId,
          customerId: input.customer.id,
          channel: input.customer.preferredChannel,
          from: "agent",
          authorName: "Service Frontdesk Agent",
          text: item.proposedMessage,
          at: item.dispatchReceipt.sentAt,
          ...(item.dispatchReceipt.providerMessageId
            ? { providerMessageId: item.dispatchReceipt.providerMessageId }
            : {}),
          subject: item.title,
          state: "agent_handling",
          unread: false,
        });
      }
      return {
        ok: true,
        duplicate: true,
        workItem: item,
        sendReceipt: {
          ok: true,
          providerId: item.dispatchReceipt.providerId,
          providerMessageId: item.dispatchReceipt.providerMessageId ?? null,
          errorCode: null,
          sentAt: item.dispatchReceipt.sentAt,
        },
        conversation,
        errorCode: null,
      };
    }

    if (item.status !== "ready_to_send") {
      return { ok: false, duplicate: false, workItem: item, sendReceipt: null, conversation: null, errorCode: `WORK_ITEM_NOT_READY:${item.status}` };
    }

    if (input.adapter.channel === "whatsapp") {
      const tenantControl = this.controls.getTenant(input.tenantId);
      const customerControl = this.controls.getCustomer(
        input.tenantId,
        input.verticalId,
        input.customer.id,
      );
      const policy = evaluateWhatsAppPolicy({
        tenantId: input.tenantId,
        adapter: input.adapter,
        production: Boolean(input.production),
        actor: "agent",
        initiation: "business_initiated",
        tenantControl,
        customerControl,
        purpose: inferredPurpose(item),
        ...(item.whatsappTemplate ? { template: item.whatsappTemplate } : {}),
      });
      if (!policy.allowed) {
        return {
          ok: false,
          duplicate: false,
          workItem: item,
          sendReceipt: null,
          conversation: null,
          errorCode: policy.blockCode ?? "WHATSAPP_POLICY_BLOCKED",
        };
      }
    }

    const sendReceipt = await input.adapter.send({
      clinicId: input.tenantId,
      patientId: input.customer.id,
      recipientPhone: input.customer.phone,
      channel: input.customer.preferredChannel,
      text: item.proposedMessage,
      replyOptions: (item.proposedReplyOptions ?? []).map((option) => ({ ...option })),
      correlationId: item.id,
      ...(item.whatsappTemplate
        ? {
            whatsappTemplate: {
              ...item.whatsappTemplate,
              ...(item.whatsappTemplate.bodyParameters
                ? { bodyParameters: [...item.whatsappTemplate.bodyParameters] }
                : {}),
            },
          }
        : {}),
    });
    if (!sendReceipt.ok) {
      return { ok: false, duplicate: false, workItem: item, sendReceipt, conversation: null, errorCode: sendReceipt.errorCode ?? "SEND_FAILED" };
    }

    const dispatched = this.workItems.markDispatched(input.tenantId, item.id, {
      providerId: sendReceipt.providerId,
      sentAt: sendReceipt.sentAt,
      ...(sendReceipt.providerMessageId ? { providerMessageId: sendReceipt.providerMessageId } : {}),
    });
    if (!dispatched) {
      return { ok: false, duplicate: false, workItem: item, sendReceipt, conversation: null, errorCode: "DISPATCH_RECEIPT_PERSIST_FAILED" };
    }

    const conversation = this.conversations.appendMessage({
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      customerId: input.customer.id,
      channel: input.customer.preferredChannel,
      from: "agent",
      authorName: "Service Frontdesk Agent",
      text: item.proposedMessage,
      at: sendReceipt.sentAt,
      ...(sendReceipt.providerMessageId ? { providerMessageId: sendReceipt.providerMessageId } : {}),
      subject: item.title,
      state: "agent_handling",
      unread: false,
    });

    return {
      ok: true,
      duplicate: false,
      workItem: dispatched,
      sendReceipt,
      conversation,
      errorCode: null,
    };
  }
}

export const serviceWorkItemDispatchRuntime = new ServiceWorkItemDispatchRuntime();
