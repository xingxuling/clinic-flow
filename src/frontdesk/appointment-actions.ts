import type {
  AppointmentAdapterContext,
  AppointmentMutationResult,
  AppointmentSystemAdapter,
} from "@/integrations/appointment-adapter";
import type { Appointment, ID } from "@/types/domain";

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

function hoursUntil(startAt: string, now: Date): number {
  return (new Date(startAt).getTime() - now.getTime()) / 3_600_000;
}

function requiresHumanApproval(
  appointment: Appointment,
  action: AppointmentInteractiveAction,
  policy: AppointmentActionPolicy,
  now: Date,
): boolean {
  if (action.kind === "confirm") return false;
  return hoursUntil(appointment.startAt, now) < policy.humanApprovalLeadHours;
}

/**
 * WhatsApp 按钮 / 病人网页按钮共用的一键预约动作执行器。
 *
 * - 确认：合法状态下可直接执行；
 * - 改期 / 取消：距离预约过近时转人工；
 * - 真正的读写只通过 AppointmentSystemAdapter，不耦合某个牙科 CMS。
 */
export async function executeAppointmentInteractiveAction(input: {
  adapter: AppointmentSystemAdapter;
  ctx: AppointmentAdapterContext;
  action: AppointmentInteractiveAction;
  policy: AppointmentActionPolicy;
  now?: Date;
}): Promise<AppointmentActionReceipt> {
  const now = input.now ?? new Date();
  const appointment = await input.adapter.getAppointment(
    input.ctx,
    input.action.appointmentId,
  );
  if (!appointment) {
    return {
      ok: false,
      status: "failed",
      message: "找不到相關預約，已轉交診所職員確認。",
      appointment: null,
      adapterCode: "NOT_FOUND",
    };
  }

  if (requiresHumanApproval(appointment, input.action, input.policy, now)) {
    return {
      ok: false,
      status: "needs_human",
      message: `距離應診不足 ${input.policy.humanApprovalLeadHours} 小時，今次改動需要診所職員確認。`,
      appointment,
      adapterCode: null,
    };
  }

  let result: AppointmentMutationResult;
  if (input.action.kind === "confirm") {
    result = await input.adapter.confirm(input.ctx, appointment.id);
  } else if (input.action.kind === "cancel") {
    result = await input.adapter.cancel(input.ctx, appointment.id);
  } else {
    result = await input.adapter.reschedule({
      ctx: input.ctx,
      appointmentId: appointment.id,
      startAt: input.action.startAt,
    });
  }

  if (!result.ok) {
    const messages: Record<AppointmentMutationResult["code"], string> = {
      OK: "已完成。",
      NOT_FOUND: "找不到相關預約，請由診所職員確認。",
      TENANT_MISMATCH: "預約不屬於目前診所，操作已阻止。",
      INVALID_TRANSITION: "目前預約狀態不允許這個操作。",
      SLOT_CONFLICT: "所選時段剛剛已被使用，請選擇其他時間。",
      INVALID_SLOT: "所選時間無效，請重新選擇。",
    };
    return {
      ok: false,
      status: "failed",
      message: messages[result.code],
      appointment: result.appointment ?? appointment,
      adapterCode: result.code,
    };
  }

  const successMessage =
    input.action.kind === "confirm"
      ? "預約已確認。"
      : input.action.kind === "cancel"
        ? "預約已取消。"
        : "改期要求已完成，新的時段正等待診所確認。";

  return {
    ok: true,
    status: "executed",
    message: successMessage,
    appointment: result.appointment ?? appointment,
    adapterCode: result.code,
  };
}
