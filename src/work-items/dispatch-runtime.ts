import {
  serviceConversationRepository,
  type BrowserServiceConversationRepository,
} from "@/conversations/repository";
import type { ServiceConversation } from "@/conversations/types";
import type { ServiceCustomer } from "@/customers/types";
import type { ChannelSendReceipt, MessagingAdapter } from "@/integrations/messaging-adapter";
import {
  serviceWorkItemRepository,
  type BrowserServiceWorkItemRepository,
} from "@/work-items/repository";
import type { ServiceWorkItem } from "@/work-items/types";

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

/**
 * 已批准工作项的通道执行层。
 * 真实 send 成功后先固化 provider receipt，再投影 Conversation；重试不会二次发送。
 */
export class ServiceWorkItemDispatchRuntime {
  constructor(
    private readonly workItems: BrowserServiceWorkItemRepository = serviceWorkItemRepository,
    private readonly conversations: BrowserServiceConversationRepository = serviceConversationRepository,
  ) {}

  async dispatch(input: {
    tenantId: string;
    verticalId: string;
    workItemId: string;
    customer: ServiceCustomer;
    adapter: MessagingAdapter;
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

    const sendReceipt = await input.adapter.send({
      clinicId: input.tenantId,
      patientId: input.customer.id,
      channel: input.customer.preferredChannel,
      text: item.proposedMessage,
      replyOptions: (item.proposedReplyOptions ?? []).map((option) => ({ ...option })),
      correlationId: item.id,
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
