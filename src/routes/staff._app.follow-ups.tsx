import { createFileRoute } from "@tanstack/react-router";

import { Route as LegacyRemindersRoute } from "./staff._app.reminders";

const FollowUpsPage = LegacyRemindersRoute.options.component!;

/**
 * Service Frontdesk canonical follow-up route.
 * `/staff/reminders` remains a compatibility alias during migration.
 */
export const Route = createFileRoute("/staff/_app/follow-ups")({
  head: () => ({
    meta: [
      { title: "跟進｜Service Frontdesk" },
      { name: "description", content: "服務提醒、召回、舊客戶喚醒與待發訊息工作流。" },
    ],
  }),
  component: FollowUpsPage,
});
