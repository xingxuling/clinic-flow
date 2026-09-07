import {
  planFrontdeskMessage,
  planServiceFrontdeskMessage,
  type FrontdeskDecision,
} from "@/frontdesk/frontdesk-agent";
import type { ClinicFaqEntry } from "@/frontdesk/faq-engine";
import type {
  ChannelSendReceipt,
  IncomingChannelMessage,
  MessagingAdapter,
} from "@/integrations/messaging-adapter";
import type { Clinic } from "@/types/domain";
import { resolveVerticalPackForClinic } from "@/verticals/registry";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface FrontdeskInboundReceipt {
  decision: FrontdeskDecision;
  autoReplyAttempted: boolean;
  autoReplyReceipt: ChannelSendReceipt | null;
  humanTaskRequired: boolean;
}

/**
 * 通用服务前台入站闭环。
 *
 * - 新调用优先传 vertical，或让系统按当前租户解析行业包；
 * - faqEntries 只作为第一版牙科兼容输入；
 * - 这里不直接修改业务系统，预约/派单等动作仍交给对应 adapter。
 */
export async function processFrontdeskInboundMessage(input: {
  clinic: Clinic;
  message: IncomingChannelMessage;
  messagingAdapter: MessagingAdapter;
  vertical?: ServiceVerticalPack;
  faqEntries?: readonly ClinicFaqEntry[];
}): Promise<FrontdeskInboundReceipt> {
  const vertical = input.vertical ?? resolveVerticalPackForClinic(input.clinic);
  const decision = input.faqEntries
    ? planFrontdeskMessage({
        clinicId: input.clinic.id,
        patientId: input.message.patientId,
        channel: input.message.channel,
        text: input.message.text,
        urgentKeywords: input.clinic.settings.urgentKeywords,
        faqEntries: input.faqEntries,
      })
    : planServiceFrontdeskMessage({
        tenantId: input.clinic.id,
        customerId: input.message.patientId,
        channel: input.message.channel,
        text: input.message.text,
        vertical,
      });

  const mayAutoReply =
    decision.autoSendAllowed &&
    !decision.requiresHuman &&
    Boolean(decision.suggestedReply) &&
    input.messagingAdapter.channel === input.message.channel;

  if (!mayAutoReply || !decision.suggestedReply) {
    return {
      decision,
      autoReplyAttempted: false,
      autoReplyReceipt: null,
      humanTaskRequired: decision.requiresHuman,
    };
  }

  const receipt = await input.messagingAdapter.send({
    clinicId: input.clinic.id,
    patientId: input.message.patientId,
    channel: input.message.channel,
    text: decision.suggestedReply,
    replyOptions:
      decision.kind === "appointment_request"
        ? [
            { id: "booking_confirm", label: "確認", payload: "appointment:confirm" },
            { id: "booking_reschedule", label: "改期", payload: "appointment:reschedule" },
            { id: "booking_cancel", label: "取消", payload: "appointment:cancel" },
          ]
        : [],
    correlationId: input.message.providerMessageId,
  });

  return {
    decision,
    autoReplyAttempted: true,
    autoReplyReceipt: receipt,
    humanTaskRequired: !receipt.ok,
  };
}
