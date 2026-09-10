import type {
  ChannelSendReceipt,
  MessagingAdapter,
  WhatsAppTemplateRef,
} from "@/integrations/messaging-adapter";
import type {
  CustomerMessagingControl,
  TenantAutomationControl,
} from "@/messaging/automation-control";
import { evaluateWhatsAppPolicy, type WhatsAppPolicyDecision } from "@/messaging/whatsapp-policy";
import type { NotificationIntent } from "@/scheduling/types";

export interface SchedulingNotificationDispatchResult {
  ok: boolean;
  receipt: ChannelSendReceipt | null;
  policy: WhatsAppPolicyDecision | null;
  errorCode: string | null;
}

/**
 * The only outbound gateway for scheduling notifications.
 *
 * A NotificationIntent contains job-scoped text and IDs only. A real phone
 * number is supplied by the channel boundary, never inferred from a customer
 * or worker ID. WhatsApp always passes through the existing Policy Gate before
 * an adapter is called.
 */
export async function dispatchSchedulingNotification(input: {
  intent: NotificationIntent;
  adapter: MessagingAdapter;
  recipientId: string;
  recipientPhone?: string;
  tenantControl: TenantAutomationControl;
  recipientControl: CustomerMessagingControl;
  production?: boolean;
  whatsappTemplate?: WhatsAppTemplateRef;
  now?: Date;
}): Promise<SchedulingNotificationDispatchResult> {
  if (input.intent.channel !== input.adapter.channel) {
    return { ok: false, receipt: null, policy: null, errorCode: "CHANNEL_ADAPTER_MISMATCH" };
  }
  if (!input.recipientId.trim()) {
    return { ok: false, receipt: null, policy: null, errorCode: "RECIPIENT_ID_REQUIRED" };
  }
  if (input.intent.channel === "whatsapp" && !input.recipientPhone?.trim()) {
    return {
      ok: false,
      receipt: null,
      policy: null,
      errorCode: "WHATSAPP_RECIPIENT_PHONE_REQUIRED",
    };
  }

  let policy: WhatsAppPolicyDecision | null = null;
  if (input.intent.channel === "whatsapp") {
    policy = evaluateWhatsAppPolicy({
      tenantId: input.intent.tenantId,
      adapter: input.adapter,
      production: Boolean(input.production),
      actor: "agent",
      initiation: "business_initiated",
      tenantControl: input.tenantControl,
      customerControl: input.recipientControl,
      purpose: input.intent.purpose,
      ...(input.whatsappTemplate ? { template: input.whatsappTemplate } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
    if (!policy.allowed) {
      return {
        ok: false,
        receipt: null,
        policy,
        errorCode: policy.blockCode ?? "WHATSAPP_POLICY_BLOCKED",
      };
    }
  }

  const receipt = await input.adapter.send({
    clinicId: input.intent.tenantId,
    patientId: input.recipientId,
    ...(input.recipientPhone ? { recipientPhone: input.recipientPhone } : {}),
    channel: input.intent.channel,
    text: input.intent.text,
    replyOptions: [],
    correlationId: input.intent.notificationId,
    ...(input.whatsappTemplate ? { whatsappTemplate: { ...input.whatsappTemplate } } : {}),
  });
  return {
    ok: receipt.ok,
    receipt,
    policy,
    errorCode: receipt.ok ? null : (receipt.errorCode ?? "SEND_FAILED"),
  };
}
