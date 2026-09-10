# Evidence Ledger

Date of this ledger: 2026-09-10. Repository: `xingxuling/clinic-flow`.

## Source and implementation evidence

| Item | Evidence | Status |
|---|---|---|
| Existing repository reused | `main@14baebb`, remote main verified before branch; feature branch `codex/smart-scheduling-privacy-v1` | PASS |
| Reality audit | [`CURRENT_STATE_AUDIT.md`](CURRENT_STATE_AUDIT.md) | PASS |
| Generic request/worker/matching IR | `src/scheduling/types.ts`, `src/scheduling/matching.ts` | CANDIDATE |
| Formal booking transitions | `src/scheduling/state-machine.ts`, `src/scheduling/runtime.ts` | CANDIDATE |
| Privacy Broker, customer-bound consent and audit | `src/privacy/types.ts`, `src/privacy/broker.ts` | CANDIDATE |
| Dual Job Agents | `src/conversations/job-intent.ts` | CANDIDATE |
| Existing WhatsApp Policy Gate retained | `src/scheduling/notification-dispatch.ts` calls `evaluateWhatsAppPolicy` | CANDIDATE |
| Database lowering | `db/migrations/0003_smart_scheduling_privacy_broker.sql` | NOT_RUN |
| RCL semantic update | `rcl/service-frontdesk-core.rcl` | CANDIDATE_ONLY |
| DWAC update | `dwac/service-frontdesk-core.dpal` | CANDIDATE_ONLY; no promotion claimed |

## Automated verification

| Check | Command | Result |
|---|---|---|
| Install | `bun install --frozen-lockfile` | PASS |
| New scheduling/privacy/agent tests | `bunx vitest run src/scheduling/__tests__ src/privacy/__tests__ src/conversations/__tests__` | PASS: 38 tests |
| Full Vitest | `bunx vitest run` | PASS: 22 files / 134 tests; corrected contradictory `ap_01` demo fixture |
| Production build | `bun run build` | PASS after UI route integration |
| TypeScript | `bunx tsc --noEmit` | BASELINE FAIL: existing importing/customer/security/vertical-scope errors; new scheduling/privacy errors cleared |
| ESLint/Prettier | `bun run lint`; targeted ESLint/Prettier checks | BASELINE FAIL: existing repository line-ending/formatting debt; new scheduling/privacy/agent/UI files pass targeted checks |
| Browser smoke | Playwright CLI: staff login → `/staff/bookings` → request → candidates → Hold → Confirm | PASS locally; visual acceptance still human gate |
| GitHub Actions | not invoked by design | NOT_RUN |

## Evidence boundaries

- Local browser storage, local build and unit tests do not prove production
  server transactions, remote CI, real device behavior, live WhatsApp delivery,
  Meta template approval, provider credentials or external calendar sync.
- The default browser PrivateDataVault is empty; exact-address persistence needs
  a deployment-specific secure vault implementation.
- The local Work Item sink is outside the scheduling repository transaction;
  production must use a transactional outbox or a compensating failure path for
  durable delivery.
- The current RCL/DWAC artifacts describe ownership and constraints but do not
  constitute verified canonical promotion of the new scheduling/privacy
  primitives.

## K400 stress mapping

This phase exercises the following Universal Stress Matrix families without
self-declaring a nine-gate PASS:

| Gate | Stress case | Evidence |
|---|---|---|
| EXPRESS | generic ServiceRequest/Worker/Job vocabulary | source + tests |
| COMPILE | strict TypeScript module contracts | build; repository baseline type debt remains |
| LOWER | browser repository and PostgreSQL migration | migration NOT_RUN |
| EXECUTE | in-memory Hold/Confirm/notification flow | 38 targeted tests |
| CORRECT | hard constraints, timezone, state transitions, privacy blocks | targeted tests |
| ROBUST | idempotency, cross-request race, rollback, tenant isolation, consent forgery and prompt injection | targeted tests |
| PERFORMANCE | no benchmark yet; bounded candidate list | NOT_RUN |
| AI_GENERATE | structured intent only; no free-form execution authority | source + security tests |
| EVIDENCE | ledger and audit events | this file + runtime audit records |

Gate result: `CANDIDATE`; human review and production deployment evidence remain
required.
