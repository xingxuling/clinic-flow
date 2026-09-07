import { handleBookingInteraction } from "@/frontdesk/booking-interaction-service";
import type { AppointmentActionPolicy } from "@/frontdesk/appointment-actions";
import type {
  AppointmentAdapterContext,
  AppointmentSystemAdapter,
} from "@/integrations/appointment-adapter";
import { AppointmentBookingAdapter } from "@/integrations/booking-adapter";
import type { CalendarAdapter } from "@/integrations/calendar-adapter";
import type { InteractiveReplyOption } from "@/integrations/messaging-adapter";
import { dentalVerticalPack } from "@/verticals/dental";

export interface AppointmentInteractionServiceReceipt {
  ok: boolean;
  status: "completed" | "choose_slot" | "needs_human" | "failed";
  text: string;
  replyOptions: InteractiveReplyOption[];
  calendarSynced: boolean | null;
}

/**
 * 牙科兼容入口。
 * 真正的确认 / 取消 / 两步改期规则由通用 handleBookingInteraction 维护；
 * 本文件只负责把旧 Appointment Adapter 与 Calendar Adapter 桥接进去。
 */
export async function handleAppointmentInteraction(input: {
  adapter: AppointmentSystemAdapter;
  calendarAdapter?: CalendarAdapter;
  ctx: AppointmentAdapterContext;
  payload: string;
  policy: AppointmentActionPolicy;
  now?: Date;
}): Promise<AppointmentInteractionServiceReceipt> {
  const bookingAdapter = new AppointmentBookingAdapter(input.adapter);

  const result = await handleBookingInteraction({
    adapter: bookingAdapter,
    ctx: {
      tenantId: input.ctx.clinicId,
      actorId: input.ctx.actorId,
    },
    payload: input.payload,
    policy: {
      humanApprovalLeadHours: input.policy.humanApprovalLeadHours,
      labels: {
        booking: dentalVerticalPack.labels.booking,
        staff: dentalVerticalPack.labels.staff,
      },
    },
    timezone: "Asia/Hong_Kong",
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.calendarAdapter
      ? {
          afterMutation: async (booking) => {
            const appointment = await input.adapter.getAppointment(
              input.ctx,
              booking.id,
            );
            if (!appointment) return { ok: false };
            const receipt = await input.calendarAdapter!.upsertAppointment(
              {
                clinicId: input.ctx.clinicId,
                providerId: input.calendarAdapter!.providerId,
              },
              appointment,
            );
            return { ok: receipt.ok };
          },
        }
      : {}),
  });

  return {
    ok: result.ok,
    status: result.status,
    text: result.text,
    replyOptions: result.replyOptions,
    calendarSynced: result.integrationSynced,
  };
}
