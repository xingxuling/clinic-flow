import { createFileRoute, redirect } from "@tanstack/react-router";

/** 舊版 /app/* 連結相容重定向到 /staff/*。 */
export const Route = createFileRoute("/app/$")({
  beforeLoad: ({ params }) => {
    const rest = params._splat ?? "";
    throw redirect({ to: `/staff/${rest}` as "/staff/today", replace: true });
  },
});
