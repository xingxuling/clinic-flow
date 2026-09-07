import { env } from "node:process";

import type {
  ChannelSendReceipt,
  OutgoingChannelMessage,
  WhatsAppBusinessPlatformAdapter,
} from "@/integrations/messaging-adapter";

export interface MetaWhatsAppCloudApiConfig {
  accessToken: string;
  phoneNumberId: string;
  /** e.g. vXX.X; deliberately supplied by deployment instead of hardcoded. */
  graphApiVersion: string;
}

function normalizedPhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function templatePayload(message: OutgoingChannelMessage) {
  const template = message.whatsappTemplate!;
  const components: unknown[] = [];

  if (template.bodyParameters?.length) {
    components.push({
      type: "body",
      parameters: template.bodyParameters.map((text) => ({ type: "text", text })),
    });
  }

  for (const [index, option] of message.replyOptions.slice(0, 3).entries()) {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload: option.payload }],
    });
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone(message.recipientPhone),
    type: "template",
    template: {
      name: template.name,
      language: { code: template.languageCode },
      ...(components.length ? { components } : {}),
    },
  };
}

function interactivePayload(message: OutgoingChannelMessage) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone(message.recipientPhone),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: message.text },
      action: {
        buttons: message.replyOptions.slice(0, 3).map((option) => ({
          type: "reply",
          reply: {
            id: option.payload,
            title: option.label.slice(0, 20),
          },
        })),
      },
    },
  };
}

function textPayload(message: OutgoingChannelMessage) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone(message.recipientPhone),
    type: "text",
    text: { preview_url: false, body: message.text },
  };
}

/**
 * Official WhatsApp Business Platform / Cloud API adapter.
 *
 * This module is server-only. Access tokens and Phone Number IDs must never be
 * bundled into the browser. Policy decisions (opt-in, 24h window, template
 * approval and Agent stop) are enforced by the caller before this adapter sends.
 */
export class MetaWhatsAppCloudApiAdapter implements WhatsAppBusinessPlatformAdapter {
  readonly providerId = "meta.whatsapp.cloud-api";
  readonly displayName = "Meta WhatsApp Business Platform（Cloud API）";
  readonly channel = "whatsapp" as const;
  readonly providerKind = "whatsapp_business_platform" as const;
  readonly productionEligible = true as const;

  constructor(private readonly config: MetaWhatsAppCloudApiConfig) {
    if (!config.accessToken.trim()) throw new Error("META_WHATSAPP_ACCESS_TOKEN_REQUIRED");
    if (!config.phoneNumberId.trim()) throw new Error("META_WHATSAPP_PHONE_NUMBER_ID_REQUIRED");
    if (!/^v\d+(\.\d+)?$/.test(config.graphApiVersion)) {
      throw new Error("META_GRAPH_API_VERSION_INVALID");
    }
  }

  async send(message: OutgoingChannelMessage): Promise<ChannelSendReceipt> {
    const sentAt = new Date().toISOString();
    if (message.channel !== "whatsapp") {
      return {
        ok: false,
        providerMessageId: null,
        providerId: this.providerId,
        errorCode: "CHANNEL_MISMATCH",
        sentAt,
      };
    }

    const phone = normalizedPhone(message.recipientPhone);
    if (!phone) {
      return {
        ok: false,
        providerMessageId: null,
        providerId: this.providerId,
        errorCode: "RECIPIENT_PHONE_REQUIRED",
        sentAt,
      };
    }

    if (!message.text.trim() && !message.whatsappTemplate) {
      return {
        ok: false,
        providerMessageId: null,
        providerId: this.providerId,
        errorCode: "EMPTY_MESSAGE",
        sentAt,
      };
    }

    const payload = message.whatsappTemplate
      ? templatePayload(message)
      : message.replyOptions.length
        ? interactivePayload(message)
        : textPayload(message);

    const url = `https://graph.facebook.com/${this.config.graphApiVersion}/${this.config.phoneNumberId}/messages`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { code?: number; message?: string };
      };

      if (!response.ok) {
        return {
          ok: false,
          providerMessageId: null,
          providerId: this.providerId,
          errorCode: data.error?.code ? `META_${data.error.code}` : `HTTP_${response.status}`,
          sentAt,
        };
      }

      return {
        ok: true,
        providerMessageId: data.messages?.[0]?.id ?? null,
        providerId: this.providerId,
        errorCode: null,
        sentAt,
      };
    } catch {
      return {
        ok: false,
        providerMessageId: null,
        providerId: this.providerId,
        errorCode: "META_NETWORK_ERROR",
        sentAt,
      };
    }
  }
}

export function metaWhatsAppCloudApiAdapterFromEnv(): MetaWhatsAppCloudApiAdapter {
  const accessToken = env["META_WHATSAPP_ACCESS_TOKEN"] ?? "";
  const phoneNumberId = env["META_WHATSAPP_PHONE_NUMBER_ID"] ?? "";
  const graphApiVersion = env["META_GRAPH_API_VERSION"] ?? "";
  return new MetaWhatsAppCloudApiAdapter({
    accessToken,
    phoneNumberId,
    graphApiVersion,
  });
}
