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
| Full Vitest | `bunx vitest run` | PASS: 22 files / 135 tests on latest-main-hardening; the earlier 134-test evidence is historical |
| Production build | `bun run build` | PASS on latest-main-hardening |
| TypeScript | `bunx tsc --noEmit` | PASS on latest-main-hardening via `bun run typecheck`; historical baseline errors were cleared |
| ESLint/Prettier | `bun run lint`; targeted ESLint/Prettier checks | Full lint remains FAIL from repository-wide formatting/line-ending debt; changed-scope checks PASS with 0 errors / 0 warnings |
| Browser smoke | Historical Playwright flow on the canonical implementation; latest local SSR route smoke | Historical flow PASS with visual human gate; latest `GET /staff/bookings` returned HTTP 200 with scheduling marker |
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

## Latest main hardening verification (2026-09-10)

The remote `main` advanced during the initial implementation and already
contained the canonical scheduling/privacy implementation at
`1e40062474d3fa56adcad387a055a2f8138dd918`. The duplicate candidate branch was
kept unmerged; this branch reused the existing `src/scheduling/`, `src/privacy/`
and `src/conversations/` owners and added only hardening and verification
changes.

| Check | Result | Evidence boundary |
|---|---|---|
| Frozen install | PASS | `bun install --frozen-lockfile` completed without dependency changes |
| Full tests | PASS | `bun run test`: 22 files / 135 tests |
| Strict typecheck | PASS | `bun run typecheck` |
| Changed-file lint | PASS | ESLint on all changed source/test files: 0 errors / 0 warnings |
| Production build | PASS | `bun run build` completed for client, SSR and Nitro output |
| Local route smoke | PASS | dev server `GET /staff/bookings`: HTTP 200 and `智能排程` marker present |
| Full lint | FAIL | `bun run lint`: 428 problems (417 errors, 11 warnings), predominantly existing `src/work-items/` and line-ending/Prettier debt |
| Migration static audit | PASS | vertical RLS predicates, `FORCE ROW LEVEL SECURITY` and GiST exclusion constraints are present |
| PostgreSQL migration execution | NOT_RUN | no live database connection or `psql` execution was used |
| WhatsApp/BSP/provider delivery | NOT_DEPLOYED | existing WhatsApp policy gate is retained; live credentials and delivery are unverified |
| Visual/device acceptance | NOT_RUN | SSR smoke is not a substitute for interactive browser, mobile or human visual review |
| GitHub Actions | NOT_USED | local verification only, by request |

The added hardening includes repository `test`/`typecheck` scripts, strict
TypeScript fixes in existing modules, vertical scoping in the scheduling
migration RLS policies, and a regression test that keeps a failed booking
replay failed instead of turning it into a duplicate success.

## Landing UI refresh verification (2026-09-10)

The screenshot-reported stale surface was the root route `/`, not the staff
route `/staff/bookings`. The root route now presents the Smart Scheduling
workflow directly and keeps both staff and Dental Demo customer entry points.

| Check | Result | Evidence |
|---|---|---|
| Root page title and route | PASS | `GET /` on local Vite server; title `Smart Scheduling｜Service Frontdesk` |
| Desktop visual check | PASS candidate | Playwright headed screenshot reviewed: new hero, workflow preview, vertical pack strip and entry cards are visible |
| Narrow viewport check | PASS candidate | Playwright viewport `390x844`; content wraps, remains scrollable, and both primary entry links remain reachable |
| Stale landing markers | PASS | old two-card-only layout was replaced in `src/routes/index.tsx` |
| Human visual acceptance | OPEN | local screenshot review is not production/browser-device acceptance |
