# Current State Audit

审计基线：远端 `xingxuling/clinic-flow` 的 `main`，commit `14baebb`（本地 checkout：2026-09-10）。本次审计只依据当前源码、迁移、RCL/DWAC 工件和测试，不把 README 或历史对话当作运行证据。

## 已有资产

- Service Frontdesk Core 与 Vertical Pack 契约：`src/verticals/types.ts`、`src/verticals/registry.ts`，已有 dental、pet-care、home-service、beauty、auto-repair 等行业包。
- 通用领域兼容层：`ServiceTenant`、`ServiceCustomer`、`ServiceBooking`、`ServiceConversation`、`ServiceWorkItem`，旧 Clinic/Patient/Appointment 仍通过 projection 保持演示兼容。
- 预约适配器边界：`AppointmentSystemAdapter`、`BookingSystemAdapter`，牙科走 legacy bridge，其他行业走 `ServiceRepositoryBookingAdapter`。
- 消息与 Agent：FAQ/前台 planner、入站摄入、对话 Repository、work item dispatch、受控 Agent executor。
- WhatsApp 基础设施：官方 Meta WhatsApp Business Platform/Cloud API adapter、模板注册表、24 小时窗口、opt-in scope、STOP、tenant Agent pause、customer human-only、人工接管和 provider fail-closed 检查。
- 安全与数据边界：所有现有 Repository 以 tenant/clinic scope 查询；PostgreSQL migration 已有复合外键、RLS、staff/service 与 patient 访问分界、审计表和 outbound idempotency key。
- UI：Staff shell、今日、对话、排程、Agent、客户、设置和审计路由；已有 Vertical 切换和牙科兼容页面。
- 语义工件：`rcl/service-frontdesk-core.rcl` 已拥有租户安全、Vertical 不得扩大权限、FAQ/Booking 受限自动执行和 fail-closed handoff；`dwac/service-frontdesk-core.dpal` 已声明 Core/Vertical ownership。

## 可直接复用资产

- 继续复用 `ServiceVerticalPack`，新增能力放在 Core contract，而不是每个行业包各写一套匹配器。
- 继续复用 `ServiceTenant`、tenant/vertical scoped Repository、`BookingSystemAdapter` 与 `ServiceWorkItem`。
- 所有 WhatsApp 出站继续从 `evaluateWhatsAppPolicy` 进入 adapter；Privacy Broker 只能减少暴露，不能绕过 WhatsApp Gate。
- 继续复用现有 `Conversation` 的人手状态与 webhook/provider message id 幂等模型，并为 Job conversation 增加通用投影。
- 继续把 PostgreSQL 作为正式持久化目标；浏览器 localStorage 只作为可运行 Demo/candidate runtime，不冒充生产并发证明。

## 架构缺口

- 缺少垂直无关的 Worker/Service Provider、Availability、Service Area、Capability、Travel/Preparation/Cleanup buffer 模型。
- 缺少 `ServiceRequest`、硬约束筛选、可解释候选排序和 Slot Search。
- 缺少正式的 `DRAFT → MATCHING → OFFERED → HELD → CUSTOMER_CONFIRMED → WORKER_NOTIFIED → SCHEDULED ...` 状态机。
- 缺少带过期时间、幂等键和并发冲突检查的 `ScheduleHold` 以及 Hold → Confirm → Lock 事务语义。
- 缺少把身份域与交易域隔离的 Privacy Broker、Job-scoped identities、DisclosurePolicy、DataCapability 和 PrivacyAuditEvent。
- 缺少 Job-scoped Customer Agent / Worker Agent 的结构化 ConversationIntent → Policy → Action 流程。

## 数据模型缺口

- `staff` 只能承担牙科/员工兼容角色，不能表达可服务项目、行政区域、重复排班、临时不可用和服务缓冲。
- `appointments` 没有 tenant-independent field-service booking、hold、request、privacy context、worker notification 或状态迁移审计字段。
- `customers` 浏览器投影把 phone 放在同一读取模型中；当前 Core 依赖调用方自律，缺少 capability-scoped read model。

## API / Service 缺口

- 当前代码以浏览器 Repository 和旧 Appointment adapter 为主，没有 Scheduling Service 的 request/match/hold/confirm API。
- 当前 `ServiceRepositoryBookingAdapter` 按固定半小时扫档，只检查现有 booking，不能检查 Worker availability、area、buffers 或 Holds。
- 入站 Core 已经有统一入口；新 Job Agent 通信还没有独立的 Channel Adapter / Conversation Core contract。

## UI 缺口

- 缺少 Worker 页面：今日/周排程、Availability、Service Area、Services、Duration、Current Jobs。
- 缺少客户需求的分步收集与候选时段解释。
- Booking 页面仍展示旧 appointment-oriented 状态，没有 Hold 倒计时、隐私说明和推荐理由。
- 对话页面还没有明确区分 Customer ↔ Platform Agent 与 Worker ↔ Platform Agent，也没有 Job intent/proposal 面板。

## 测试缺口

- 现有测试覆盖 FAQ、WhatsApp Gate、STOP/human-only、旧预约动作和 tenant/vertical projection，但没有 Worker matching、buffer、Hold expiry/atomic confirm、privacy disclosure、Job agent scope 或跨 Worker/tenant negative cases。
- package scripts 没有显式 `test`、`typecheck`；需要用本地 Vitest/TypeScript 命令补齐可重复验证入口。
- 浏览器 localStorage 不能提供跨 tab/process 的真正原子 CAS；正式双重预约证明必须依赖数据库迁移的 range exclusion/transaction，不能由 Demo 运行结果替代。

## 本次最合理的升级路径

1. 在 Core 建立纯函数、垂直无关的 scheduling contracts：Worker、availability、area、duration、ServiceRequest、MatchingPolicy、SchedulingCandidate 和正式状态机。
2. 用可重放的 Browser Scheduling Repository 实现 MVP Hold/Confirm/Lock；加入同一 runtime 的 critical section、idempotency key、过期清理，并把生产并发约束写入 PostgreSQL migration。
3. 建立 Privacy Broker 的 capability-scoped views、job identity、progressive disclosure、retention 和审计；Scheduling/Matching 输入永远不包含 phone 或完整地址。
4. 建立 Job conversation/intent/proposal Core，保留既有 WhatsApp adapter 与 policy gate，出站只通过已有 Gate。
5. 以 home-service 作为 field-service 压力测试 Vertical，以 dental 兼容 projection 做回归；接入 Worker、Request、Matching、Privacy、Conversation UI。
6. 增加正负例、并发/幂等、隔离与 Agent 越权测试，运行本地 lint/typecheck/unit/build，再做 Architecture Audit 和 Evidence Ledger。

## 证据边界

当前基线是源码和静态结构证据。Meta 生产凭据、真实租户、真实设备、PostgreSQL 部署、跨进程锁和人工视觉验收均不在本地基线中；完成后仍将分别标记 `VERIFIED`、`CANDIDATE` 或 `BLOCKED`，不把本地 Demo 提升为生产证明。
