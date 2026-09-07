import { executeBookingInteractiveAction } from "@/frontdesk/booking-actions";
import type {
  AppointmentAdapterContext,
  AppointmentMutationResult,
  AppointmentSystemAdapter,
} from "@/integrations/appointment-adapter";
import { AppointmentBookingAdapter } from "@/integrations/booking-adapter";
import type { Appointment, ID } from "@/types/domain";
import { dentalVerticalPack } from "@/verticals/dental";

export type AppointmentInteractiveAction =
  | { kind: "confirm"; appointmentId: ID }
  | { kind: "cancel"; appointmentId: ID }
  | { kind: "reschedule"; appointmentId: ID; startAt: string };

export interface AppointmentActionPolicy {
  /** 距离应诊少于此小时数时，取消或改期必须转人工。 */
  humanApprovalLeadHours: number;
}

export interface AppointmentActionReceipt {
  ok: boolean;
  status: "executed" | "needs_human" | "failed";
  message: string;
  appointment: Appointment | null;
  adapterCode: AppointmentMutationResult["code"] | null;
}

/**
 * 第一版牙科兼容入口。
 * 真正动作规则只维护在 executeBookingInteractiveAction；这里负责类型/字段桥接。
 */
export async function executeAppointmentInteractiveAction(input: {
  adapter: AppointmentSystemAdapter;
  ctx: AppointmentAdapterContext;
  action: AppointmentInteractiveAction;
  policy: AppointmentActionPolicy;
  now?: Date;
}): Promise<AppointmentActionReceipt> {
  const bookingAdapter = new AppointmentBookingAdapter(input.adapter);
  const bookingAction =
    input.action.kind === "confirm"
      ? { kind: "confirm" as const, bookingId: input.action.appointmentId }
      : input.action.kind === "cancel"
        ? { kind: "cancel" as const, bookingId: input.action.appointmentId }
        : {
            kind: "reschedule" as const,
            bookingId: input.action.appointmentId,
            startAt: input.action.startAt,
          };

  const result = await executeBookingInteractiveAction({
    adapter: bookingAdapter,
    ctx: { tenantId: input.ctx.clinicId, actorId: input.ctx.actorId },
    action: bookingAction,
    policy: {
      humanApprovalLeadHours: input.policy.humanApprovalLeadHours,
      labels: {
        booking: dentalVerticalPack.labels.booking,
        staff: dentalVerticalPack.labels.staff,
      },
    },
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  const appointment = result.booking
    ? await input.adapter.getAppointment(input.ctx, result.booking.id)
    : null;

  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    appointment,
    adapterCode: result.adapterCode,
  };
}
