import { createFileRoute } from "@tanstack/react-router";

import { Route as LegacyAppointmentsRoute } from "./staff._app.appointments";

const BookingsPage = LegacyAppointmentsRoute.options.component!;

/**
 * Service Frontdesk canonical booking route.
 * `/staff/appointments` remains a compatibility alias during migration.
 */
export const Route = createFileRoute("/staff/_app/bookings")({
  head: () => ({
    meta: [
      { title: "排程｜Service Frontdesk" },
      { name: "description", content: "通用服務業排程：預約、入廠、上門時段、確認、改期與取消。" },
    ],
  }),
  component: BookingsPage,
});
