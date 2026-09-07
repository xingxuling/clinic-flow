import type {
  BookingAdapterContext,
  BookingMutationCode,
  BookingRecord,
  BookingSystemAdapter,
} from "@/integrations/booking-adapter";
import type { VerticalLabels } from "@/verticals/types";

export type BookingInteractiveAction =
  | { kind: "confirm"; bookingId: string }
  | { kind: "cancel"; bookingId: string }
  | { kind: "reschedule"; bookingId: string; startAt: string };

export interface BookingActionPolicy {
  humanApprovalLeadHours: number;
  labels: Pick<VerticalLabels, "booking" | "staff">;
}

export interface BookingActionReceipt {
  ok: boolean;
  status: "executed" | "needs_human" | "failed";
  message: string;
  booking: BookingRecord | null;
  adapterCode: BookingMutationCode | null;
}

function hoursUntil(startAt: string, now: Date): number {
  return (new Date(startAt).getTime() - now.getTime()) / 3_600_000;
}

function requiresHumanApproval(
  booking: BookingRecord,
  action: BookingInteractiveAction,
  policy: BookingActionPolicy,
  now: Date,
): boolean {
  if (action.kind === "confirm") return false;
  return hoursUntil(booking.startAt, now) < policy.humanApprovalLeadHours;
}

/**
 * 通用 Booking 执行器：适用于到店预约、入厂预约和上门时段。
 */
export async function executeBookingInteractiveAction(input: {
  adapter: BookingSystemAdapter;
  ctx: BookingAdapterContext;
  action: BookingInteractiveAction;
  policy: BookingActionPolicy;
  now?: Date;
}): Promise<BookingActionReceipt> {
  const now = input.now ?? new Date();
  const booking = await input.adapter.getBooking(input.ctx, input.action.bookingId);
  if (!booking) {
    return {
      ok: false,
      status: "failed",
      message: `找不到相關${input.policy.labels.booking}，已轉交${input.policy.labels.staff}確認。`,
      booking: null,
      adapterCode: "NOT_FOUND",
    };
  }

  if (booking.tenantId !== input.ctx.tenantId) {
    return {
      ok: false,
      status: "failed",
      message: `${input.policy.labels.booking}不屬於目前商戶，操作已阻止。`,
      booking,
      adapterCode: "TENANT_MISMATCH",
    };
  }

  if (requiresHumanApproval(booking, input.action, input.policy, now)) {
    return {
      ok: false,
      status: "needs_human",
      message: `距離服務時間不足 ${input.policy.humanApprovalLeadHours} 小時，今次改動需要${input.policy.labels.staff}確認。`,
      booking,
      adapterCode: null,
    };
  }

  const result =
    input.action.kind === "confirm"
      ? await input.adapter.confirm(input.ctx, booking.id)
      : input.action.kind === "cancel"
        ? await input.adapter.cancel(input.ctx, booking.id)
        : await input.adapter.reschedule({
            ctx: input.ctx,
            bookingId: booking.id,
            startAt: input.action.startAt,
          });

  if (!result.ok) {
    const messages: Record<BookingMutationCode, string> = {
      OK: "已完成。",
      NOT_FOUND: `找不到相關${input.policy.labels.booking}，請由${input.policy.labels.staff}確認。`,
      TENANT_MISMATCH: `${input.policy.labels.booking}不屬於目前商戶，操作已阻止。`,
      INVALID_TRANSITION: `目前${input.policy.labels.booking}狀態不允許這個操作。`,
      SLOT_CONFLICT: "所選時段剛剛已被使用，請選擇其他時間。",
      INVALID_SLOT: "所選時間無效，請重新選擇。",
    };
    return {
      ok: false,
      status: "failed",
      message: messages[result.code],
      booking: result.booking ?? booking,
      adapterCode: result.code,
    };
  }

  return {
    ok: true,
    status: "executed",
    message:
      input.action.kind === "confirm"
        ? `${input.policy.labels.booking}已確認。`
        : input.action.kind === "cancel"
          ? `${input.policy.labels.booking}已取消。`
          : `改期已完成，新的時段正等待${input.policy.labels.staff}確認。`,
    booking: result.booking ?? booking,
    adapterCode: result.code,
  };
}
