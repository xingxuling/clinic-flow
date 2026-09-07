import {
  bookingInteractionPayload,
  parseBookingInteractionPayload,
} from "@/frontdesk/booking-interaction";
import {
  executeBookingInteractiveAction,
  type BookingActionPolicy,
} from "@/frontdesk/booking-actions";
import type {
  BookingAdapterContext,
  BookingRecord,
  BookingSystemAdapter,
} from "@/integrations/booking-adapter";
import type { InteractiveReplyOption } from "@/integrations/messaging-adapter";

export interface BookingInteractionServiceReceipt {
  ok: boolean;
  status: "completed" | "choose_slot" | "needs_human" | "failed";
  text: string;
  replyOptions: InteractiveReplyOption[];
  integrationSynced: boolean | null;
}

function slotLabel(startAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startAt));
}

/**
 * 通用 Booking 按钮处理：确认 / 取消 / 两步改期。
 * afterMutation 可接日历、CMS、CRM 或其他外部投影，不把供应商写死在 Core。
 */
export async function handleBookingInteraction(input: {
  adapter: BookingSystemAdapter;
  ctx: BookingAdapterContext;
  payload: string;
  policy: BookingActionPolicy;
  timezone: string;
  now?: Date;
  afterMutation?: (booking: BookingRecord) => Promise<{ ok: boolean }>;
}): Promise<BookingInteractionServiceReceipt> {
  const parsed = parseBookingInteractionPayload(input.payload);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      text: `這個${input.policy.labels.booking}操作連結無效，請重新打開最新訊息。`,
      replyOptions: [],
      integrationSynced: null,
    };
  }

  const now = input.now ?? new Date();

  if (parsed.kind === "reschedule_request") {
    const booking = await input.adapter.getBooking(input.ctx, parsed.bookingId);
    if (!booking) {
      return {
        ok: false,
        status: "failed",
        text: `找不到相關${input.policy.labels.booking}，已轉交${input.policy.labels.staff}確認。`,
        replyOptions: [],
        integrationSynced: null,
      };
    }
    if (booking.tenantId !== input.ctx.tenantId) {
      return {
        ok: false,
        status: "failed",
        text: `${input.policy.labels.booking}不屬於目前商戶，操作已阻止。`,
        replyOptions: [],
        integrationSynced: null,
      };
    }

    const hoursUntil =
      (new Date(booking.startAt).getTime() - now.getTime()) / 3_600_000;
    if (hoursUntil < input.policy.humanApprovalLeadHours) {
      return {
        ok: false,
        status: "needs_human",
        text: `距離服務時間不足 ${input.policy.humanApprovalLeadHours} 小時，今次改期需要${input.policy.labels.staff}確認。`,
        replyOptions: [],
        integrationSynced: null,
      };
    }

    const slots = await input.adapter.findAvailableSlots({
      ctx: input.ctx,
      resourceId: booking.resourceId,
      serviceId: booking.serviceId,
      from: now.toISOString(),
      days: 14,
      maxResults: 6,
    });

    if (slots.length === 0) {
      return {
        ok: false,
        status: "needs_human",
        text: `暫時找不到合適空檔，已轉交${input.policy.labels.staff}幫你安排。`,
        replyOptions: [],
        integrationSynced: null,
      };
    }

    return {
      ok: true,
      status: "choose_slot",
      text: "可以，以下是目前可選時段：",
      replyOptions: slots.map((slot, index) => ({
        id: `slot_${index + 1}_${booking.id}`,
        label: slotLabel(slot.startAt, input.timezone),
        payload: bookingInteractionPayload({
          kind: "reschedule_select",
          bookingId: booking.id,
          startAt: slot.startAt,
        }),
      })),
      integrationSynced: null,
    };
  }

  const action =
    parsed.kind === "confirm"
      ? { kind: "confirm" as const, bookingId: parsed.bookingId }
      : parsed.kind === "cancel"
        ? { kind: "cancel" as const, bookingId: parsed.bookingId }
        : {
            kind: "reschedule" as const,
            bookingId: parsed.bookingId,
            startAt: parsed.startAt,
          };

  const receipt = await executeBookingInteractiveAction({
    adapter: input.adapter,
    ctx: input.ctx,
    action,
    policy: input.policy,
    now,
  });

  if (!receipt.ok || !receipt.booking) {
    return {
      ok: receipt.ok,
      status:
        receipt.status === "needs_human"
          ? "needs_human"
          : receipt.status === "executed"
            ? "completed"
            : "failed",
      text: receipt.message,
      replyOptions: [],
      integrationSynced: null,
    };
  }

  if (!input.afterMutation) {
    return {
      ok: true,
      status: "completed",
      text: receipt.message,
      replyOptions: [],
      integrationSynced: null,
    };
  }

  const external = await input.afterMutation(receipt.booking);
  if (!external.ok) {
    return {
      ok: true,
      status: "needs_human",
      text: `${receipt.message} 但外部系統同步失敗，請${input.policy.labels.staff}檢查。`,
      replyOptions: [],
      integrationSynced: false,
    };
  }

  return {
    ok: true,
    status: "completed",
    text: receipt.message,
    replyOptions: [],
    integrationSynced: true,
  };
}
