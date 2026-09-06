import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/staff/")({
  beforeLoad: () => {
    throw redirect({ to: "/staff/today" });
  },
});
