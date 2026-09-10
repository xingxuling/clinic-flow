import { createFileRoute } from "@tanstack/react-router";

import { WorkersPage } from "@/scheduling/WorkersPage";

export const Route = createFileRoute("/staff/_app/workers")({
  head: () => ({
    meta: [
      { title: "Worker｜Service Frontdesk" },
      { name: "description", content: "Worker 能力、服务区、每周档期和当前工作。" },
    ],
  }),
  component: WorkersPage,
});
