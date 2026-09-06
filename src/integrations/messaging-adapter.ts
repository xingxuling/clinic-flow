import type { ChannelKind, ID } from "@/types/domain";

export interface IncomingChannelMessage {
  providerMessageId: string;
  clinicId: ID;
  patientId: ID;
  channel: ChannelKind;
  text: string;
  receivedAt: string;
}

export interface InteractiveReplyOption {
  id: string;
  label: string;
  payload: string;
}

export interface OutgoingChannelMessage {
  clinicId: ID;
  patientId: ID;
  channel: ChannelKind;
  text: string;
  replyOptions: InteractiveReplyOption[];
  correlationId: string;
}

export interface ChannelSendReceipt {
  ok: boolean;
  providerMessageId: string | null;
  providerId: string;
  errorCode: string | null;
  sentAt: string;
}

export interface MessagingAdapter {
  readonly providerId: string;
  readonly displayName: string;
  readonly channel: ChannelKind;
  send(message: OutgoingChannelMessage): Promise<ChannelSendReceipt>;
}

/**
 * 第一阶段的 WhatsApp 模拟适配器。
 * 正式接 Meta WhatsApp Business / BSP（业务解决方案供应商）时，
 * 只替换这个接口的实现，不改 FAQ、预约与 Agent 编排。
 */
export class MockWhatsAppAdapter implements MessagingAdapter {
  readonly providerId = "clinic-flow.whatsapp.mock";
  readonly displayName = "WhatsApp 演示通道";
  readonly channel: ChannelKind = "whatsapp";

  private readonly sent: OutgoingChannelMessage[] = [];

  async send(message: OutgoingChannelMessage): Promise<ChannelSendReceipt> {
    if (message.channel !== "whatsapp") {
      return {
        ok: false,
        providerMessageId: null,
        providerId: this.providerId,
        errorCode: "CHANNEL_MISMATCH",
        sentAt: new Date().toISOString(),
      };
    }
    if (!message.text.trim()) {
      return {
        ok: false,
        providerMessageId: null,
        providerId: this.providerId,
        errorCode: "EMPTY_MESSAGE",
        sentAt: new Date().toISOString(),
      };
    }

    this.sent.push({
      ...message,
      replyOptions: message.replyOptions.map((option) => ({ ...option })),
    });
    const sentAt = new Date().toISOString();
    return {
      ok: true,
      providerMessageId: `wa_demo_${this.sent.length.toString().padStart(4, "0")}`,
      providerId: this.providerId,
      errorCode: null,
      sentAt,
    };
  }

  snapshot(): OutgoingChannelMessage[] {
    return this.sent.map((message) => ({
      ...message,
      replyOptions: message.replyOptions.map((option) => ({ ...option })),
    }));
  }
}
