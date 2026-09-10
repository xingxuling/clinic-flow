import { describe, expect, it } from "vitest";

import { staffNavItemsFor } from "@/components/layout/nav-items";
import {
  LEGACY_STAFF_ROUTE_REDIRECTS,
  STAFF_ROUTES,
  canonicalStaffRoute,
} from "@/navigation/staff-routes";
import { dentalVerticalPack } from "@/verticals/dental";

const canonical = Object.values(STAFF_ROUTES);

describe("staff route information architecture", () => {
  it("defines eleven unique capability-oriented canonical staff routes", () => {
    expect(canonical).toHaveLength(11);
    expect(new Set(canonical).size).toBe(canonical.length);
    expect(canonical).toEqual([
      "/staff/today",
      "/staff/inbox",
      "/staff/bookings",
      "/staff/workers",
      "/staff/agent",
      "/staff/follow-ups",
      "/staff/customers",
      "/staff/documents",
      "/staff/staff",
      "/staff/audit",
      "/staff/settings",
    ]);
  });

  it("uses only canonical routes in staff navigation", () => {
    const nav = staffNavItemsFor(dentalVerticalPack);
    expect(nav.map((item) => item.to)).toEqual(canonical);
    expect(nav.map((item) => item.label)).toEqual([
      "今日",
      "對話",
      "排程",
      "師傅",
      "Agent",
      "跟進",
      "客戶",
      "資料",
      "員工",
      "審計",
      "設定",
    ]);
  });

  it("canonicalizes only the three historical dental-era staff paths", () => {
    expect(LEGACY_STAFF_ROUTE_REDIRECTS).toEqual({
      "/staff/appointments": "/staff/bookings",
      "/staff/reminders": "/staff/follow-ups",
      "/staff/patients": "/staff/customers",
    });
    expect(canonicalStaffRoute("/staff/appointments")).toBe("/staff/bookings");
    expect(canonicalStaffRoute("/staff/reminders")).toBe("/staff/follow-ups");
    expect(canonicalStaffRoute("/staff/patients")).toBe("/staff/customers");
    expect(canonicalStaffRoute("/staff/inbox")).toBeNull();
  });
});
