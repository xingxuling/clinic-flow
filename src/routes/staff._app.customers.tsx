import { createFileRoute } from "@tanstack/react-router";

import { Route as LegacyPatientsRoute } from "./staff._app.patients";

const CustomersPage = LegacyPatientsRoute.options.component!;

/**
 * Service Frontdesk canonical customer route.
 * `/staff/patients` remains a compatibility alias during migration.
 */
export const Route = createFileRoute("/staff/_app/customers")({
  head: () => ({
    meta: [
      { title: "客戶｜Service Frontdesk" },
      { name: "description", content: "通用服務業客戶、服務對象、舊資料匯入與跟進資料。" },
    ],
  }),
  component: CustomersPage,
});
