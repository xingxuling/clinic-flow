import {
  appointmentInteractionPayload,
  parseAppointmentInteractionPayload,
} from "@/frontdesk/appointment-interaction";
import {
  executeAppointmentInteractiveAction,
  type AppointmentActionPolicy,
} from "@/frontdesk/appointment-actions";
import type { AppointmentAdapterContext, AppointmentSystemAdapter } from "@/integrations/appointment-adapter";
import type { CalendarAdapter } from "@/integrations/calendar-adapter";
import type { InteractiveReplyOption } from "@/integrations/messaging-adapter";

export interface AppointmentInteractionServiceReceipt {
  ok: boolean;
  status: "completed" | "choose_slot" | "needs_human" | "failed";
  text: string;
  replyOptions: InteractiveReplyOption[];
  calendarSynced: boolean | null;
}

function slotLabel(startAt: string): string {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startAt));
}

/**
 * 处理 WhatsApp / Web 的预约按钮 payload。
 *
 * 改期分两步：
 * 1. reschedule_request -> 查询可用时段；
 * 2. reschedule_select -> 执行具体时段改期。
 *
 * 预约动作成功后，可选地同步到日历适配器。日历同步失败不会伪装成预约失败，
 * 但会把结果提升为需要前台检查。
 */
export async function handleAppointmentInteraction(input: {
  adapter: AppointmentSystemAdapter;
  calendarAdapter?: CalendarAdapter;
  ctx: AppointmentAdapterContext;
  payload: string;
  policy: AppointmentActionPolicy;
  now?: Date;
}): Promise<AppointmentInteractionServiceReceipt> {
  const parsed = parseAppointmentInteractionPayload(input.payload);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      text: "這個操作連結無效，請重新打開最新的預約訊息。",
      replyOptions: [],
      calendarSynced: null,
    };
  }

  const now = input.now ?? new Date();

  if (parsed.kind === "reschedule_request") {
    const appointment = await input.adapter.getAppointment(input.ctx, parsed.appointmentId);
    if (!appointment) {
      return {
        ok: false,
        status: "failed",
        text: "找不到相關預約，已轉交診所職員確認。",
        replyOptions: [],
        calendarSynced: null,
      };
    }

    const hoursUntil =
      (new Date(appointment.startAt).getTime() - now.getTime()) / 3_600_000;
    if (hoursUntil < input.policy.humanApprovalLeadHours) {
      return {
        ok: false,
        status: "needs_human",
        text: `距離應診不足 ${input.policy.humanApprovalLeadHours} 小時，今次改期需要診所職員確認。`,
        replyOptions: [],
        calendarSynced: null,
      };
    }

    const slots = await input.adapter.findAvailableSlots({
      ctx: input.ctx,
      practitionerId: appointment.practitionerId,
      serviceId: appointment.serviceId,
      from: now.toISOString(),
      days: 14,
      maxResults: 6,
    });

    if (slots.length === 0) {
      return {
        ok: false,
        status: "needs_human",
        text: "暫時找不到合適空檔，已轉交診所職員幫你安排。",
        replyOptions: [],
        calendarSynced: null,
      };
    }

    return {
      ok: true,
      status: "choose_slot",
      text: "可以，以下是目前可選時段：",
      replyOptions: slots.map((slot, index) => ({
        id: `slot_${index + 1}_${appointment.id}`,
        label: slotLabel(slot.startAt),
        payload: appointmentInteractionPayload({
          kind: "reschedule_select",
          appointmentId: appointment.id,
          startAt: slot.startAt,
        }),
      })),
      calendarSynced: null,
    };
  }

  const action =
    parsed.kind === "confirm"
      ? { kind: "confirm" as const, appointmentId: parsed.appointmentId }
      : parsed.kind === "cancel"
        ? { kind: "cancel" as const, appointmentId: parsed.appointmentId }
        : {
            kind: "reschedule" as const,
            appointmentId: parsed.appointmentId,
            startAt: parsed.startAt,
          };

  const receipt = await executeAppointmentInteractiveAction({
    adapter: input.adapter,
    ctx: input.ctx,
    action,
    policy: input.policy,
    now,
  });

  if (!receipt.ok || !receipt.appointment) {
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
      calendarSynced: null,
    };
  }

  if (!input.calendarAdapter) {
    return {
      ok: true,
      status: "completed",
      text: receipt.message,
      replyOptions: [],
      calendarSynced: null,
    };
  }

  const calendarReceipt = await input.calendarAdapter.upsertAppointment(
    {
      clinicId: input.ctx.clinicId,
      providerId: input.calendarAdapter.providerId,
    },
    receipt.appointment,
  );

  if (!calendarReceipt.ok) {
    return {
      ok: true,
      status: "needs_human",
      text: `${receipt.message} 但日曆同步失敗，請前台檢查。`,
      replyOptions: [],
      calendarSynced: false,
    };
  }

  return {
    ok: true,
    status: "completed",
    text: receipt.message,
    replyOptions: [],
    calendarSynced: true,
  };
}
