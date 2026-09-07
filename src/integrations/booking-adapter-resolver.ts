import type { ServiceBookingRepository } from "@/bookings/repository";
import { serviceBookingRepository } from "@/bookings/repository";
import type { AppointmentSystemAdapter } from "@/integrations/appointment-adapter";
import {
  AppointmentBookingAdapter,
  ServiceRepositoryBookingAdapter,
  type BookingSystemAdapter,
} from "@/integrations/booking-adapter";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface ResolveBookingAdapterInput {
  vertical: ServiceVerticalPack;
  appointmentAdapter?: AppointmentSystemAdapter;
  serviceBookingRepository?: ServiceBookingRepository;
}

/**
 * Booking Adapter 的唯一 Vertical 路由点。
 *
 * - Dental 旧资料仍通过 AppointmentBookingAdapter 兼容现有诊所 Repository/CMS；
 * - 其他行业走原生 ServiceBookingRepository；
 * - Dental 没有显式 legacy adapter 时 fail-closed，不偷偷改写到另一套资料库。
 */
export function resolveBookingSystemAdapter(
  input: ResolveBookingAdapterInput,
): BookingSystemAdapter {
  if (input.vertical.id === "dental" || input.vertical.id === "regulated-health") {
    if (!input.appointmentAdapter) {
      throw new Error(`LEGACY_APPOINTMENT_ADAPTER_REQUIRED:${input.vertical.id}`);
    }
    return new AppointmentBookingAdapter(input.appointmentAdapter);
  }

  return new ServiceRepositoryBookingAdapter(
    input.vertical,
    input.serviceBookingRepository ?? serviceBookingRepository,
  );
}
