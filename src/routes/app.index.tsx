import { createFileRoute, redirect } from "@tanstack/react-router";

/** 舊版 /app 入口相容重定向。 */
export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({ to: "/staff/today", replace: true });
  },
});
