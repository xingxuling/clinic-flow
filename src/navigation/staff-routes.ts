export const STAFF_ROUTES = {
  today: "/staff/today",
  inbox: "/staff/inbox",
  bookings: "/staff/bookings",
  workers: "/staff/workers",
  agent: "/staff/agent",
  followUps: "/staff/follow-ups",
  customers: "/staff/customers",
  documents: "/staff/documents",
  staff: "/staff/staff",
  audit: "/staff/audit",
  settings: "/staff/settings",
} as const;

export type CanonicalStaffRoute = (typeof STAFF_ROUTES)[keyof typeof STAFF_ROUTES];

export const LEGACY_STAFF_ROUTE_REDIRECTS = {
  "/staff/appointments": STAFF_ROUTES.bookings,
  "/staff/reminders": STAFF_ROUTES.followUps,
  "/staff/patients": STAFF_ROUTES.customers,
} as const;

export type LegacyStaffRoute = keyof typeof LEGACY_STAFF_ROUTE_REDIRECTS;

export function canonicalStaffRoute(pathname: string): CanonicalStaffRoute | null {
  return LEGACY_STAFF_ROUTE_REDIRECTS[pathname as LegacyStaffRoute] ?? null;
}
