import { useEffect, useState } from "react";

import { SCHEDULING_CHANGED_EVENT, schedulingRepository } from "@/scheduling/repository";
import type {
  ScheduleHold,
  ServiceRequest,
  ServiceScheduleBooking,
  ServiceWorker,
} from "@/scheduling/types";

export interface SchedulingSnapshot {
  workers: ServiceWorker[];
  requests: ServiceRequest[];
  holds: ScheduleHold[];
  bookings: ServiceScheduleBooking[];
}

export function useSchedulingSnapshot(tenantId: string, verticalId: string): SchedulingSnapshot {
  const [snapshot, setSnapshot] = useState<SchedulingSnapshot>({
    workers: [],
    requests: [],
    holds: [],
    bookings: [],
  });

  useEffect(() => {
    const refresh = () => {
      schedulingRepository.refresh();
      setSnapshot({
        workers: schedulingRepository.listWorkers(tenantId, verticalId),
        requests: schedulingRepository.listRequests(tenantId, verticalId),
        holds: schedulingRepository.listHolds(tenantId, verticalId),
        bookings: schedulingRepository.listBookings(tenantId, verticalId),
      });
    };
    refresh();
    window.addEventListener(SCHEDULING_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener(SCHEDULING_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.clearInterval(timer);
    };
  }, [tenantId, verticalId]);

  return snapshot;
}
