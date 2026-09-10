# Scheduling State Machine

## Booking states

```text
DRAFT → MATCHING → OFFERED → HELD → CUSTOMER_CONFIRMED
                                      ↓
                              WORKER_NOTIFIED → SCHEDULED
                                                     ↓
                                             IN_PROGRESS → COMPLETED
```

Terminal or recovery branches:

```text
OFFERED → DECLINED / CANCELLED / FAILED
HELD → EXPIRED / CANCELLED / FAILED
SCHEDULED → RESCHEDULE_REQUIRED / CANCELLED
IN_PROGRESS → FAILED
DECLINED / RESCHEDULE_REQUIRED / FAILED → MATCHING or CANCELLED
CANCELLED → DRAFT or MATCHING
```

`src/scheduling/state-machine.ts` is the executable transition table. Invalid
transitions throw `INVALID_BOOKING_TRANSITION` and are not silently coerced.

## Request and Hold lifecycle

1. Validate tenant, vertical, customer, service and approximate area.
2. Mark the request `MATCHING` and apply hard constraints.
3. If candidates exist, mark it `OFFERED`.
4. Recompute the selected candidate and atomically create a five-minute Hold
   bound to the request's customer subject.
5. Confirm only an active, unexpired Hold with the same customer subject;
   recheck Worker status and occupancy.
6. Create the booking and Job aggregate in one repository transaction.
7. Queue customer and Worker notification intents.
8. Mark `WORKER_NOTIFIED` when the Worker intent is sent; mark `SCHEDULED` when
   all notification intents are sent.

## Idempotency and concurrency

Request, Hold and Confirm operations carry idempotency keys. Repeated Confirm
returns the already-created booking and does not create a second Job,
Conversation, notification set or booking. Per-occupancy locks serialize local
candidate races. The PostgreSQL `service_schedule_reservations` exclusion
constraint is the authoritative server-side overlap guard.

## Failure recovery

If Job, privacy context, notification-intent or Work Item creation fails before
commit, the local in-memory repository restores its snapshot. A production
repository must provide an actual database transaction and an outbox/work-item
transaction boundary; a browser localStorage snapshot is only a candidate
implementation. External notification delivery is queued and receipt-backed,
never claimed sent by Confirm itself.
