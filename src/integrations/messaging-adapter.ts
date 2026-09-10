import type { ChannelKind, ID } from "@/types/domain";

export interface IncomingChannelMessage {
  providerMessageId: string;
  clinicId: ID;
  patientId: ID;
  /** E.164 or provider-normalized sender phone when available. */
  senderPhone?: string;
  channel: ChannelKind;
  text: string;
  receivedAt: string;
}

export interface InteractiveReplyOption {
  id: string;
  label: string;
  payload: string;
}

export type WhatsAppTemplateCategory = "utility" | "marketing" | "authentication";

export interface WhatsAppTemplateRef {
  name: string;
  languageCode: string;
  category: WhatsAppTemplateCategory;
  /** Positional body parameters for an approved Meta template. */
  bodyParameters?: string[];
}

export interface OutgoingChannelMessage {
  clinicId: ID;
  patientId: ID;
  /**
   * Production WhatsApp providers require a real recipient number. Internal
   * customer/patient IDs are never treated as phone numbers.
   */
  recipientPhone?: string;
  channel: ChannelKind;
  text: string;
  replyOptions: InteractiveReplyOption[];
  correlationId: string;
  /**
   * Outside the WhatsApp 24-hour customer service window, production sends must
   * use an approved template. The policy gate validates this before dispatch.
   */
  whatsappTemplate?: WhatsAppTemplateRef;
}

/**
 * Job-scoped channel payload. The scheduling core only carries an opaque
 * endpoint reference; resolving that reference to a real recipient remains a
 * channel/provider concern and must pass the existing policy gates.
 */
export interface JobChannelMessage {
  tenantId: ID;
  verticalId: string;
  jobId: ID;
  audience: "customer" | "worker";
  endpointRef: string;
  channel: ChannelKind;
  text: string;
  replyOptions: InteractiveReplyOption[];
  correlationId: string;
}

/**
 * Unified channel boundary for job notifications. Implementations are allowed
 * to enqueue only; they do not gain permission to disclose private contacts or
 * bypass the WhatsApp policy gate.
 */
export interface JobChannelAdapter {
  readonly providerId: string;
  readonly channel: ChannelKind;
  readonly providerKind: MessagingProviderKind;
  readonly productionEligible: boolean;
  sendJob(message: JobChannelMessage): Promise<ChannelSendReceipt>;
}

export interface ChannelSendReceipt {
  ok: boolean;
  providerMessageId: string | null;
  providerId: string;
  errorCode: string | null;
  sentAt: string;
}

export type MessagingProviderKind = "demo" | "whatsapp_business_platform" | "other_production";

export interface MessagingAdapter {
  readonly providerId: string;
  readonly displayName: string;
  readonly channel: ChannelKind;
  readonly providerKind: MessagingProviderKind;
  /**
   * `true` means this adapter is an approved production integration path.
   * A normal WhatsApp consumer/business app automation must never set this flag.
   */
  readonly productionEligible: boolean;
  send(message: OutgoingChannelMessage): Promise<ChannelSendReceipt>;
}

export interface WhatsAppBusinessPlatformAdapter extends MessagingAdapter {
  readonly channel: "whatsapp";
  readonly providerKind: "whatsapp_business_platform";
  readonly productionEligible: true;
}

function cloneTemplate(template: WhatsAppTemplateRef): WhatsAppTemplateRef {
  return {
    ...template,
    ...(template.bodyParameters ? { bodyParameters: [...template.bodyParameters] } : {}),
  };
}

/**
 * Demo-only WhatsApp adapter.
 *
 * Production must use the official WhatsApp Business Platform / Cloud API (or an
 * authorized BSP built on the Platform). This adapter intentionally cannot be
 * marked production eligible.
 */
export class MockWhatsAppAdapter implements MessagingAdapter {
  readonly providerId = "service-frontdesk.whatsapp.mock";
  readonly displayName = "WhatsApp 模擬通道";
  readonly channel: ChannelKind = "whatsapp";
  readonly providerKind: MessagingProviderKind = "demo";
  readonly productionEligible = false;

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
      ...(message.whatsappTemplate
        ? { whatsappTemplate: cloneTemplate(message.whatsappTemplate) }
        : {}),
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
      ...(message.whatsappTemplate
        ? { whatsappTemplate: cloneTemplate(message.whatsappTemplate) }
        : {}),
    }));
  }
}
