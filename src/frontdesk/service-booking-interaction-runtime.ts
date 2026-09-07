import { handleBookingInteraction } from "@/frontdesk/booking-interaction-service";
import type { AppointmentSystemAdapter } from "@/integrations/appointment-adapter";
import { resolveBookingSystemAdapter } from "@/integrations/booking-adapter-resolver";
import type { ServiceBookingRepository } from "@/bookings/repository";
import type { ServiceVerticalPack } from "@/verticals/types";

/**
 * Vertical-aware Booking 按钮 Runtime。
 *
 * 这是通用 webhook / Messaging callback 应调用的入口：
 * Dental 使用旧 Appointment bridge；其他行业使用原生 ServiceBookingRepository。
 */
export async function handleServiceBookingInteraction(input: {
  tenantId: string;
  actorId: string;
  vertical: ServiceVerticalPack;
  payload: string;
  timezone: string;
  now?: Date;
  appointmentAdapter?: AppointmentSystemAdapter;
  serviceBookingRepository?: ServiceBookingRepository;
  afterMutation?: Parameters<typeof handleBookingInteraction>[0]["afterMutation"];
}) {
  const adapter = resolveBookingSystemAdapter({
    vertical: input.vertical,
    ...(input.appointmentAdapter ? { appointmentAdapter: input.appointmentAdapter } : {}),
    ...(input.serviceBookingRepository
      ? { serviceBookingRepository: input.serviceBookingRepository }
      : {}),
  });

  return handleBookingInteraction({
    adapter,
    ctx: {
      tenantId: input.tenantId,
      actorId: input.actorId,
    },
    payload: input.payload,
    policy: {
      humanApprovalLeadHours: input.vertical.defaultHumanApprovalLeadHours,
      labels: {
        booking: input.vertical.labels.booking,
        staff: input.vertical.labels.staff,
      },
    },
    timezone: input.timezone,
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.afterMutation ? { afterMutation: input.afterMutation } : {}),
  });
}
