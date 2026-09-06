import { planFrontdeskMessage, type FrontdeskDecision } from "@/frontdesk/frontdesk-agent";
import type { ClinicFaqEntry } from "@/frontdesk/faq-engine";
import type {
  ChannelSendReceipt,
  IncomingChannelMessage,
  MessagingAdapter,
} from "@/integrations/messaging-adapter";
import type { Clinic } from "@/types/domain";

export interface FrontdeskInboundReceipt {
  decision: FrontdeskDecision;
  autoReplyAttempted: boolean;
  autoReplyReceipt: ChannelSendReceipt | null;
  humanTaskRequired: boolean;
}

/**
 * 第一阶段入站处理闭环。
 *
 * 这里故意不直接写病历、不直接修改预约。预约意图交给预约动作层，
 * FAQ 才允许在诊所授权文本范围内自动回复；紧急与未知问题均转人工。
 */
export async function processFrontdeskInboundMessage(input: {
  clinic: Clinic;
  message: IncomingChannelMessage;
  faqEntries: readonly ClinicFaqEntry[];
  messagingAdapter: MessagingAdapter;
}): Promise<FrontdeskInboundReceipt> {
  const decision = planFrontdeskMessage({
    clinicId: input.clinic.id,
    patientId: input.message.patientId,
    channel: input.message.channel,
    text: input.message.text,
    urgentKeywords: input.clinic.settings.urgentKeywords,
    faqEntries: input.faqEntries,
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
            { id: "appointment_confirm", label: "確認", payload: "appointment:confirm" },
            { id: "appointment_reschedule", label: "改期", payload: "appointment:reschedule" },
            { id: "appointment_cancel", label: "取消", payload: "appointment:cancel" },
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
