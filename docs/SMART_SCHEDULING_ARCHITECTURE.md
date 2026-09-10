# Smart Scheduling & Privacy Broker Core

## Scope

This phase adds a generic Service Frontdesk scheduling core. It is shared by
appointment, field-service and hybrid verticals; dental, pet-care, home-service,
beauty and auto-repair remain configuration packs rather than separate engines.

The existing Clinic Flow appointment path remains available at
`/staff/appointments`. The canonical new staff experience is `/staff/bookings`.

## Ownership and lowering

The stable semantic owner remains `rcl/service-frontdesk-core.rcl`. The new
TypeScript modules are a lowering/runtime candidate for the missing scheduling
and privacy primitives:

- `src/scheduling/types.ts` — request, worker, reservation, hold, booking, Job
  and notification IR;
- `src/scheduling/matching.ts` — deterministic hard filters and weighted ranker;
- `src/scheduling/state-machine.ts` — formal booking transition table;
- `src/scheduling/runtime.ts` — request, Hold, Confirm and recovery workflow;
- `src/privacy/broker.ts` — purpose-bound progressive disclosure;
- `src/conversations/job-intent.ts` — dual-agent intent compiler and takeover;
- `src/scheduling/notification-dispatch.ts` — outbound channel boundary.

This is not a claim that RCL or DWAC has already absorbed or promoted these
primitives. The gap and evidence status are recorded in `EVIDENCE_LEDGER.md`.

## Request and worker model

`ServiceRequest` contains only scheduling inputs: tenant/vertical/customer,
optional subject, service items, approximate area, local date/time with IANA
timezone, duration, urgency, requirements, attachments and preferences. An
exact address is not part of matching input.

`Worker` contains tenant/vertical scope, active status, service areas,
capabilities with duration bounds, weekly availability, exceptions and
travel/preparation/cleanup buffers. The demo seed derives capabilities from the
active Vertical Pack and contains no dental-only worker schema.

## Matching algorithm

Matching first applies non-compensating hard constraints:

1. tenant and vertical equality;
2. active Worker status;
3. all requested service capabilities;
4. duration bounds;
5. service-area membership;
6. weekly availability and exceptions;
7. occupancy overlap against confirmed bookings and unexpired Holds.

Candidates are then scored using explicit configurable weights for time
proximity, geographic fit, capability fit, workload, urgency, preference,
reliability, travel cost and schedule efficiency. Each result contains a stable
candidate ID, score breakdown, rank, classification and human-readable reason
codes. A score cannot compensate for a failed hard constraint.

The runtime interprets `requestedDate` and `requestedTime` in `ServiceRequest.timeZone`.
Omitted timezone is retained as UTC-compatible behavior for legacy callers. The
UI passes the tenant timezone, so a Hong Kong 10:00 request remains 10:00 in
the UI while the stored instant is UTC.

## Hold and Confirm

`Hold` defaults to five minutes and reserves the complete worker occupancy
interval, not just the service duration. Hold creation serializes the tenant /
vertical scope because candidate IDs are request-specific; Confirm acquires a
per-occupancy lock. The browser candidate uses `navigator.locks` when available
and falls back to an in-process lock. The PostgreSQL migration adds a GiST
exclusion constraint as the server-side no-double-booking gate.

Confirm is idempotent by hold and booking idempotency keys. It rechecks Hold
status/expiry, tenant/vertical scope, Worker status and reservations, then
creates the booking, Job identities, privacy context, dual-agent conversation,
notification intents and a reviewable Work Item. In-memory repository writes
roll back on downstream failure. The browser storage is a local candidate and
is not a substitute for a server transaction.

Exact-address consent is a customer-subject-bound record in the Privacy Broker;
the caller cannot promote a request-local boolean into consent. Production must
persist that record and the booking, reservation, privacy context and outbox in
one server transaction.

Notification completion exposes `CUSTOMER_CONFIRMED → WORKER_NOTIFIED →
SCHEDULED`; the intermediate state is intentionally observable.

## UI

`SmartSchedulingPage` provides:

- Worker schedule cards with capabilities, areas, availability and buffers;
- request collection with vertical services and tenant timezone;
- ranked candidates and exclusion reasons;
- five-minute Hold and Confirm form;
- public Job identities and privacy messaging;
- a scoped dual-Agent Conversation view for safe intent parsing, phone blocking,
  human takeover and WhatsApp STOP handling.

All UI data is scoped by `clinic.id` plus the selected Vertical Pack. The page
labels the local implementation as a candidate; real provider delivery,
server persistence and visual acceptance remain separate gates.
