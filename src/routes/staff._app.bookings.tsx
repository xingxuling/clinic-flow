import { createFileRoute } from "@tanstack/react-router";

import { SchedulingPage } from "@/scheduling/SchedulingPage";

/**
 * Service Frontdesk canonical scheduling route.
 * `/staff/appointments` remains the legacy dental compatibility surface.
 */
export const Route = createFileRoute("/staff/_app/bookings")({
  head: () => ({
    meta: [
      { title: "智能排程｜Service Frontdesk" },
      {
        name: "description",
        content: "通用服务业 Customer Request、Worker 匹配、Hold 与确认锁定。",
      },
    ],
  }),
  component: SchedulingPage,
});
