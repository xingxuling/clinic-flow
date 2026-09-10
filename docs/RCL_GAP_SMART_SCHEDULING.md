# RCL Gap Record: Smart Scheduling & Privacy Broker

这次实现没有静默绕过 RCL。RCL 继续拥有 tenant／vertical safety、human gate、fail-closed 与权限语义；以下能力目前由 TypeScript/SQL lowerings 承担，作为候选 gap 记录，不能因为代码通过就晋升为 RCL Core。

| Gap                                        | 当前 lowering / donor                            | 通用性 | 未来吸收候选                                 | K400 stress cells                                     |
| ------------------------------------------ | ------------------------------------------------ | ------ | -------------------------------------------- | ----------------------------------------------------- |
| 带时区的本地时间到 instant、跨日窗口       | `src/scheduling/matching.ts` + `Intl`            | 高     | timezone-aware temporal primitive            | EXPRESS, COMPILE, LOWER, EXECUTE, CORRECT, ROBUST     |
| interval overlap 与服务前后 buffer         | matcher + PostgreSQL `tstzrange` / GiST          | 高     | interval/resource constraint primitive       | COMPILE, LOWER, EXECUTE, CORRECT, ROBUST, PERFORMANCE |
| 地理服务区／邮编／半径硬过滤               | `ServiceArea` lowering，距离函数                 | 中高   | geo-membership / distance evidence primitive | EXPRESS, LOWER, EXECUTE, CORRECT, ROBUST              |
| Hold 与 Booking 跨表并发锁                 | PostgreSQL advisory transaction lock + exclusion | 高     | atomic resource reservation primitive        | LOWER, EXECUTE, CORRECT, ROBUST, PERFORMANCE          |
| 参与方、阶段、用途、同意驱动的最小披露     | `PrivacyBroker` + SQL secret/audit tables        | 高     | capability-scoped disclosure primitive       | EXPRESS, LOWER, EXECUTE, CORRECT, ROBUST, EVIDENCE    |
| 双 Agent intent/proposal 与 human takeover | Job Conversation Core                            | 中高   | bounded proposal / takeover primitive        | EXPRESS, COMPILE, LOWER, EXECUTE, CORRECT, EVIDENCE   |

## 裁决状态

- `EXPRESS / COMPILE / LOWER / EXECUTE / CORRECT / ROBUST`：纯 TypeScript 定向测试已通过；SQL 与真实 Postgres 尚未执行，因此数据库 runtime 只标 `CANDIDATE`。
- `PERFORMANCE`：尚未做真实并发或路由 provider 压测，不能宣称通过。
- `AI_GENERATE`：本阶段没有用 LLM 生成可直接执行的排程或隐私裁决；结构化 intent 仍须人工／服务层 gate。
- `EVIDENCE`：代码、测试和文档已沉淀；真实数据库、真实 Worker、真实 Channel、真实 WhatsApp/BSP、跨设备视觉验收仍开放。

## No Silent RCL Bypass

Task：Phase 1 Smart Scheduling & Privacy Broker Core。缺失能力：时间区间／资源原子锁／geo membership／capability-scoped disclosure。Workaround：TypeScript 纯函数与 PostgreSQL lowerings。Donor：`Intl` temporal conversion、PostgreSQL GiST range/exclusion、既有 `MessagingAdapter` 与 WhatsApp policy。Affected K400 cells 如上；是否吸收 RCL 需单独的 primitive 设计、回归、Integration Court 与 human approval。
