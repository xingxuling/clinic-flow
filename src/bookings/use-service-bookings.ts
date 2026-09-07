import { useEffect, useMemo, useState } from "react";

import {
  SERVICE_BOOKINGS_CHANGED_EVENT,
  serviceBookingRepository,
} from "@/bookings/repository";
import {
  appointmentToServiceBooking,
  type NewServiceBookingInput,
  type ServiceBooking,
  type ServiceBookingStatus,
} from "@/bookings/types";
import { canTransitionAppointment } from "@/data/repository";
import type { Appointment, Clinic } from "@/types/domain";
import type { ServiceVerticalPack } from "@/verticals/types";

interface LegacyBookingActions {
  setStatus: (id: string, to: ServiceBookingStatus) => void;
  reschedule: (id: string, startAt: string) => void;
  create: (input: {
    patientId: string;
    practitionerId: string;
    serviceId: string;
    startAt: string;
    durationMin: number;
    room: string;
    note: string;
  }) => void;
}

export function useServiceBookings(input: {
  clinic: Clinic;
  vertical: ServiceVerticalPack;
  legacyAppointments: readonly Appointment[];
  legacyActions?: LegacyBookingActions;
}) {
  const [persisted, setPersisted] = useState<ServiceBooking[]>([]);

  useEffect(() => {
    const refresh = () =>
      setPersisted(serviceBookingRepository.list(input.clinic.id, input.vertical.id));
    refresh();
    window.addEventListener(SERVICE_BOOKINGS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SERVICE_BOOKINGS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [input.clinic.id, input.vertical.id]);

  const bookings = useMemo(() => {
    const rows = new Map<string, ServiceBooking>();
    if (input.vertical.id === "dental") {
      for (const appointment of input.legacyAppointments) {
        const booking = appointmentToServiceBooking(appointment);
        if (booking.verticalId === input.vertical.id) rows.set(booking.id, booking);
      }
    }
    for (const booking of persisted) rows.set(booking.id, booking);
    return [...rows.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [input.legacyAppointments, input.vertical.id, persisted]);

  const setStatus = (bookingId: string, to: ServiceBookingStatus): boolean => {
    const booking = bookings.find((row) => row.id === bookingId);
    if (!booking || !canTransitionAppointment(booking.status, to)) return false;
    if (booking.source === "legacy_appointment_compat") {
      input.legacyActions?.setStatus(bookingId, to);
      return Boolean(input.legacyActions);
    }
    return Boolean(serviceBookingRepository.update(input.clinic.id, bookingId, { status: to }));
  };

  const reschedule = (bookingId: string, startAt: string): boolean => {
    const booking = bookings.find((row) => row.id === bookingId);
    if (!booking || Number.isNaN(new Date(startAt).getTime())) return false;
    if (booking.source === "legacy_appointment_compat") {
      input.legacyActions?.reschedule(bookingId, startAt);
      return Boolean(input.legacyActions);
    }
    const duration = new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime();
    return Boolean(
      serviceBookingRepository.update(input.clinic.id, bookingId, {
        startAt,
        endAt: new Date(new Date(startAt).getTime() + duration).toISOString(),
        status: "pending",
      }),
    );
  };

  const create = (booking: Omit<NewServiceBookingInput, "tenantId" | "verticalId">): ServiceBooking | null => {
    if (input.vertical.id === "dental" && input.legacyActions) {
      input.legacyActions.create({
        patientId: booking.customerId,
        practitionerId: booking.resourceId,
        serviceId: booking.serviceId,
        startAt: booking.startAt,
        durationMin: booking.durationMin,
        room: booking.venue,
        note: booking.note ?? "",
      });
      return null;
    }
    return serviceBookingRepository.add({
      ...booking,
      tenantId: input.clinic.id,
      verticalId: input.vertical.id,
    });
  };

  return { bookings, setStatus, reschedule, create };
}
