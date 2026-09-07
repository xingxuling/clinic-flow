import type { ServiceTenant } from "@/core/tenant";
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
import type { ChannelKind, Clinic } from "@/types/domain";
import { clinicToServiceTenant } from "@/core/tenant";
import { resolveVerticalPackForClinic } from "@/verticals/registry";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface FrontdeskInboundReceipt {
  decision: FrontdeskDecision;
  autoReplyAttempted: boolean;
  autoReplyReceipt: ChannelSendReceipt | null;
  humanTaskRequired: boolean;
}

export interface IncomingServiceMessage {
  providerMessageId: string;
  tenantId: string;
  customerId: string;
  channel: ChannelKind;
  text: string;
  receivedAt: string;
}

/**
 * 新通用入口。这里已经不依赖 Clinic / Patient 领域类型。
 * MessagingAdapter 暂时仍使用旧 clinicId/patientId 字段作为兼容 wire format，
 * 待外部通道升级时再统一迁移，不影响 Core 语义。
 */
export async function processServiceFrontdeskInboundMessage(input: {
  tenant: ServiceTenant;
  vertical: ServiceVerticalPack;
  message: IncomingServiceMessage;
  messagingAdapter: MessagingAdapter;
}): Promise<FrontdeskInboundReceipt> {
  if (input.message.tenantId !== input.tenant.id) {
    return {
      decision: {
        kind: "human_handoff",
        risk: "high",
        appointmentIntent: null,
        autoSendAllowed: false,
        requiresHuman: true,
        suggestedReply: null,
        summary: "消息租户与当前商户不一致，已阻止处理。",
        reasons: ["TENANT_MISMATCH", "FAIL_CLOSED_TO_HUMAN"],
        matchedUrgentKeywords: [],
        faqEntryId: null,
      },
      autoReplyAttempted: false,
      autoReplyReceipt: null,
      humanTaskRequired: true,
    };
  }

  const decision = planServiceFrontdeskMessage({
    tenantId: input.tenant.id,
    customerId: input.message.customerId,
    channel: input.message.channel,
    text: input.message.text,
    vertical: input.vertical,
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
    clinicId: input.tenant.id,
    patientId: input.message.customerId,
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

/**
 * 第一版 Clinic Flow 兼容入口。
 * 牙科现有调用继续工作；新行业优先使用 processServiceFrontdeskInboundMessage。
 */
export async function processFrontdeskInboundMessage(input: {
  clinic: Clinic;
  message: IncomingChannelMessage;
  messagingAdapter: MessagingAdapter;
  vertical?: ServiceVerticalPack;
  faqEntries?: readonly ClinicFaqEntry[];
}): Promise<FrontdeskInboundReceipt> {
  const vertical = input.vertical ?? resolveVerticalPackForClinic(input.clinic);

  if (!input.faqEntries) {
    return processServiceFrontdeskInboundMessage({
      tenant: clinicToServiceTenant(input.clinic, vertical.id),
      vertical,
      message: {
        providerMessageId: input.message.providerMessageId,
        tenantId: input.message.clinicId,
        customerId: input.message.patientId,
        channel: input.message.channel,
        text: input.message.text,
        receivedAt: input.message.receivedAt,
      },
      messagingAdapter: input.messagingAdapter,
    });
  }

  // 旧牙科测试／调用继续走显式 FAQ 输入，避免一次重构破坏既有演示行为。
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
    replyOptions: [],
    correlationId: input.message.providerMessageId,
  });

  return {
    decision,
    autoReplyAttempted: true,
    autoReplyReceipt: receipt,
    humanTaskRequired: !receipt.ok,
  };
}
