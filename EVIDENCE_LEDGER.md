# Evidence Ledger — Smart Scheduling & Privacy Broker

## Scope

Repository: `xingxuling/clinic-flow`
Baseline: `14baebb1aded6a6a81a11f8f21c58b7bf7c1b3d0`
Candidate branch: `codex/smart-scheduling-privacy-core`
Local checkout: `C:\Users\User\Documents\RCL\_worktrees\clinic-flow-upgrade`

## Implemented

- Worker contract：服务区、邮编／半径、能力、每周档期、例外、显式 block、时区、可靠性与 urgency。
- ServiceRequest：service items、approximate area、date/time/window、duration、urgency、requirements、attachments、privacy level、完整状态机。
- Matching：tenant／vertical／active／capability／area／availability 硬过滤，buffer-aware reserved range，time/geo/capability/workload/urgency/preference/reliability/travel/efficiency 可解释排序。
- Hold/Confirm/Lock：内存／浏览器候选实现含幂等、过期、重复确认、冲突与通知失败；PostgreSQL migration 提供 RLS、GiST overlap 与 worker transaction lock lowering。
- Privacy Broker：Job alias、最小 Job View、分阶段披露、exact address consent、private phone fail-closed、opaque endpoint、审计与 retention。
- Dual Agent：Customer Agent／Worker Agent 的 job-scoped conversation、结构化 intent/proposal、human takeover/resume、无跨 Job 传播。
- Channel：复用既有 `MessagingAdapter` 与 WhatsApp policy，并新增 `JobChannelAdapter` opaque endpoint contract；排程确认只入队通知，不能绕过 WhatsApp opt-in/STOP/24h/template/provider gate。
- UI／docs／RCL gap／DWAC：见 `src/routes/staff._app.bookings.tsx`、`src/routes/staff._app.workers.tsx`、`docs/`、`rcl/`、`dwac/`。

## Verification ledger

| Check                                                              | Result                                                                                 | Boundary                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Smart scheduling / privacy / dual-agent / state-machine unit tests | PASS: 22 test files / 135 tests (`bun run test`)                                      | Pure/local repository candidate only                                     |
| Existing full Vitest regression                                    | PASS: 22 test files / 135 tests (`bun run test`)                                      | Does not prove remote CI, live DB, provider delivery or human acceptance |
| TypeScript                                                         | PASS at final local run: `bun run typecheck`                                           | Static type evidence only                                                |
| Changed-file ESLint                                                | PASS at final local run: scoped lint                                                   | Full-repository lint retains pre-existing formatting noise               |
| Full ESLint                                                        | FAIL: 370 errors / 11 warnings (`bun run lint`); broad Prettier and line-ending debt remains | Not hidden or converted into a false pass                            |
| Build                                                              | PASS: `bun run build`; route tree regenerated for bookings/workers                     | Build evidence only; no production deployment claim                      |
| Local dev route smoke                                               | PASS: dev server `/staff/bookings` returned HTTP 200 with scheduling markers          | SSR reachability only; not browser visual or production evidence          |
| PostgreSQL migration execution                                     | NOT RUN                                                                                | No live DB credentials/runtime evidence in this task                     |
| Real WhatsApp/BSP delivery                                         | NOT DEPLOYED                                                                           | No owner credentials or provider proof                                   |
| Physical Worker/device/browser visual acceptance                   | NOT RUN                                                                                | Local browser candidate is not human acceptance                          |
| GitHub Actions                                                     | NOT USED                                                                               | User requested no Actions consumption                                    |

## Open gates

1. Review and accept the candidate branch / merge commit.
2. Run the PostgreSQL migration in a controlled tenant-scoped environment.
3. Perform browser visual, real channel, and Worker/device acceptance.
4. Post-merge verification remains separate from source/build evidence.
