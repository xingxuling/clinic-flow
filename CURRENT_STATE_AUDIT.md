# CURRENT_STATE_AUDIT

审计日期：2026-09-10  
审计来源：`xingxuling/clinic-flow` `main@14baebb1aded6a6a81a11f8f21c58b7bf7c1b3d0`  
远端：`https://github.com/xingxuling/clinic-flow.git`  
审计分支：`codex/smart-scheduling-privacy-v1`

## 结论

仓库已经完成从 Dental-only Demo 向 **Service Frontdesk Core + Vertical Pack** 的第一轮迁移。租户、行业包、通用 Customer/Service/Resource/Booking 语义、Adapter 边界、Agent fail-closed 规则以及 2026-09-07 建立的 WhatsApp Business Platform Policy Gate 都是可复用的现有资产。

当前缺口不是再增加一个预约页面，而是缺少一个真正拥有以下语义的 Core：

```text
ServiceRequest
  -> constraint filtering
  -> candidate ranking / slot search
  -> ScheduleHold
  -> customer confirmation
  -> atomic booking lock
  -> WorkItem / Job Conversation
  -> privacy-scoped disclosure
```

因此本轮应增加通用 Smart Scheduling & Privacy Broker Core，并以兼容投影接入现有牙科 Demo；不应在 `dental` 行业包内复制一套排程或通信系统。

## 已有资产

### Core 与 Vertical

- `src/core/tenant.ts` 已有 `ServiceTenant`，可从旧 `Clinic` 映射为通用租户。
- `src/verticals/types.ts` 已有 `ServiceVerticalPack`、服务定义、行业标签、服务对象字段、FAQ、升级规则和受限问题契约。
- `src/verticals/registry.ts` 已注册 dental、pet-care、home-service、beauty、auto-repair、regulated-health，并可按稳定 `serviceId` 解析行业。
- `src/verticals/entity-scope.ts` 已提供 `verticalId` 过滤；早期无字段的 seed 兼容解释为 dental。
- `src/bookings/types.ts` 已有通用 `ServiceBooking`，但仍是对旧 `Appointment` 的兼容层。

### Booking / Appointment / Work Item

- `src/types/domain.ts` 的 `Appointment`、`AppointmentStatus` 是旧诊所模型；状态只有 `pending/confirmed/arrived/no_show/cancelled`。
- `src/bookings/repository.ts` 的 `BrowserServiceBookingRepository` 使用单一 `localStorage` 键保存 Booking，并按 `tenantId + verticalId` 查询。
- `src/integrations/booking-adapter.ts` 已有稳定 `BookingSystemAdapter`，同时提供旧 Appointment bridge 和新 ServiceBooking repository adapter。
- `ServiceRepositoryBookingAdapter.findAvailableSlots` 当前只按固定 09:00-19:00、30 分钟步长和既有 Booking 查找空档；不理解 Worker 能力、服务区、交通/准备/收尾 buffer、Hold 或策略权重。
- `src/work-items/` 已有服务 Work Item 类型、Repository、dispatch runtime 和 WhatsApp policy metadata；它可以复用为确认后的通知/人工任务投影，但当前不拥有 Job 交易锁或双边 Agent 会话。

### Customer / Subject / Staff / Provider

- `src/customers/types.ts` 与 `src/customers/repository.ts` 已有 Customer 对旧 Patient 的通用投影。
- 旧 `Patient` 仍在 `src/types/domain.ts`，包含真实电话；它不能直接暴露给排程引擎或另一方 Agent。
- `ServiceVerticalPack.subjectKind` 已支持 person、pet、vehicle、property、none，但没有统一的 Subject、Worker/Provider、Capability、Area、Availability 数据模型。
- `Staff` 仍是诊所员工模型，`role === practitioner` 被旧 Agent 创建预约逻辑当作唯一可服务资源；没有通用 Worker 状态、服务能力或服务半径。

### Tenant / Vertical 隔离

- 旧 `InMemoryClinicRepository` 的方法以 `clinicId` 为第一参数并按租户过滤。
- 新 Browser booking/conversation repositories 按 `tenantId + verticalId` 过滤，服务层也会拒绝不匹配的 tenant。
- `ServiceConversationIngestRuntime` 对 provider message id 做租户/行业范围内的幂等检查，并在不匹配时 fail-closed、不持久化。
- 现有数据库 RLS 以 `clinic_id` 为租户边界；`0002_harden_fk_and_patient_writes.sql` 已将关键复合外键改为 `RESTRICT`，并撤销病人直接更新基表的策略。

### Inbox / Messaging / Reminder / Agent

- `src/conversations/` 已有通用 `ServiceConversation`、Browser repository、provider message id 去重和统一入站 runtime。
- `src/messaging/automation-control.ts` 已有租户 Agent 总开关、客户 `human_only`、WhatsApp opt-in/opt-out、STOP 检测和独立 consent scope。
- `src/messaging/whatsapp-policy.ts` 已有确定性的 24 小时窗口、opt-in、template、purpose、生产 provider 和 Agent 暂停 Gate。
- `src/integrations/messaging-adapter.ts` 保留 Demo adapter，并规定生产 WhatsApp 只能走官方 Business Platform / approved BSP 路径。
- `src/integrations/meta-whatsapp-cloud-api.server.ts` 是 server-only Meta Cloud API adapter，使用真实 recipient phone，不把内部 ID 当电话号码。
- `src/frontdesk/frontdesk-agent.ts`、`src/frontdesk/inbound-service.ts` 已有 Vertical-driven FAQ/booking/escalation/human handoff 编排；受限问题优先于一般预约意图。
- `src/lib/agent-executor.ts` 已限制为显式行政操作集合，执行前完整验证，medium/high risk 需要人工批准，失败关闭。
- `src/reminders/` 与 `src/work-items/dispatch-runtime.ts` 已有提醒规划和通知 dispatch，可作为后续 Worker/Customer 通知出口。

### UI 与路由

- `/staff/today`、`/staff/inbox`、`/staff/bookings`、`/staff/agent`、`/staff/customers`、`/staff/audit`、`/staff/settings` 已由统一 StaffShell 和 Vertical labels 驱动。
- `/staff/bookings` 目前只是 `/staff/appointments` 的兼容路由投影，仍展示旧 Appointment 语义。
- `/staff/inbox` 已支持 Agent 摘要、人工接管、人工回复和 Demo WhatsApp 入站；展示的是 Customer 与平台前台对话，但没有 Job-scoped 双边 Agent UI。
- `/patient/*` 是牙科兼容客户端，直接操作旧 Appointment/Conversation；后续应新增通用 Customer Request、匹配候选、Hold/Confirm 与 Privacy 说明，同时保留兼容入口。

### 2026-09-07 WhatsApp 资产核对

Git history 显示 2026-09-07 已连续落地并测试：官方 Meta Cloud API adapter、真实 sender/recipient phone 传递、24 小时窗口、approved template、opt-in 与 consent scope、STOP、客户 human-only、租户 Agent kill switch、生产 provider 限制，以及工作项 dispatch 前的 Policy Gate。最新提交 `14baebb` 明确保持 WhatsApp opt-in 与客户 human-only 状态独立。

本轮新增 Privacy Broker 必须调用这些现有策略；它不能直接调用 Messaging Adapter 绕过 `evaluateWhatsAppPolicy`，也不能因 Job 身份隐藏电话号码而声称已完成 WhatsApp 合规发送。

## 可直接复用资产

1. 使用 `ServiceVerticalPack` 作为行业配置 Owner；新能力只依赖通用 `serviceId`、labels、mode 和 policy 字段。
2. 使用 `BookingSystemAdapter`、`MessagingAdapter`、`CalendarAdapter` 的 Adapter 边界，不让 Core 读取具体 CMS 或 WhatsApp API。
3. 保留旧 `Appointment` / `Patient` 作为 dental compatibility projection，不破坏已有 Demo。
4. 将现有 `ServiceBookingRepository`、`ServiceConversationRepository`、`ServiceWorkItemRepository` 的 Browser storage 模式扩展为可替换的内存/服务器 Repository。
5. 将 `ServiceConversationIngestRuntime` 的 provider idempotency、tenant/vertical scope、human-only 与 STOP 控制作为新 Conversation Core 的前置 Gate。
6. 将 `WhatsApp Policy Gate` 作为唯一 WhatsApp 出站授权路径；新 channel 只实现 Adapter，不复制业务规则。
7. 将 `agent-executor` 的 closed operation set、全量验证、人类批准与 receipt 作为 Agent Action 的安全基线。
8. 复用现有 `M3` 组件、StaffShell、Vertical presentation helpers 和路由命名，新增页面只补通用工作流。

## 架构缺口

### 数据模型缺口

- 没有 Worker/ServiceProvider、WorkerStatus、Availability、Exception/holiday、confirmed booking、ScheduleHold、service area、capability、duration/buffer policy。
- 没有统一 `ServiceRequest`，不能保存 approximate area、time window、urgency、requirements、attachments、privacy level 与 request status。
- Booking 状态没有 `DRAFT -> MATCHING -> OFFERED -> HELD -> CUSTOMER_CONFIRMED -> WORKER_NOTIFIED -> SCHEDULED` 及 `EXPIRED/DECLINED/RESCHEDULE_REQUIRED/FAILED` 等交易状态。
- 没有 Job、Job-scoped identity、Customer Agent/Worker Agent、ConversationIntent、DisclosurePolicy、PrivacyAuditEvent、RetentionPolicy。
- 现有持久化没有 idempotency key、hold token、版本号或唯一资源时间约束，无法在真实并发下证明不重复预约。

### API / Service 缺口

- 目前可用的是浏览器仓储和 UI action，不是可重试的 request/match/hold/confirm service。
- `ServiceRepositoryBookingAdapter.confirm` 只把 pending 改为 confirmed，未验证 Hold、未原子锁定资源、未创建 Work Item/Conversation/Privacy Context，也无恢复编排。
- Slot search 只接收 resourceId/serviceId，不能从 Request 计算 Worker 候选和 buffer 后的占用区间。
- Agent 只有旧 Appointment 行政操作，没有 Privacy Broker capability check、intent compile 或 Job scope。

### UI 缺口

- Staff 排程仍是 Appointment 列表，不显示 Worker weekly calendar、Availability、Area、Capability、Duration/buffer 和候选解释。
- 客户端没有分步 Service Request、推荐 Worker/Slot、Hold 倒计时、确认交易和私隐披露说明。
- Inbox 没有 `Customer ↔ Platform Agent` / `Worker ↔ Platform Agent` 的 Job-scoped 双边视图，也没有结构化 intent 状态。
- 现有隐私主要依赖展示层和旧 Patient session，缺少架构层数据 capability 封装。

### 测试缺口

- 现有测试覆盖 Vertical、WhatsApp、旧预约动作、对话摄入和 Agent executor，但没有 Worker 约束筛选、buffer、候选排序、Hold 过期、原子 Confirm、重复 Confirm、Privacy disclosure、跨 Worker Job scope 等 20 项新要求。
- Browser `localStorage` repository 在并发 tab / 网络重试下没有可证明的 compare-and-swap 或 server transaction；必须把这一边界写成测试与证据，而不是把 Demo storage 冒充生产锁。
- 尚无 UI 路由/键盘滚动/移动端 Hold/Confirm 的自动验证，完成后仍需区分静态与人工视觉验收。

### RCL / DWAC / OPP 缺口

- 仓库已有 `rcl/service-frontdesk-core.rcl` 与 `dwac/service-frontdesk-core.dpal`，可作为权限、租户、Vertical 与 fail-closed 语义 Owner/工件目标。
- 本地检查到的 RCL 文件目前表达 FAQ、Booking、升级与人工接管权限，不包含可执行的排程区间算法、并发锁、隐私 field-level capability 或 channel policy runtime。
- 当前项目没有可直接导入本次 TypeScript runtime 的已验证 OPP 内部协议；已有 OPP asset 适合跨系统协商，不应为内部 Core 另造临时协议。
- 因而本轮将把通用业务规则写成显式的 TypeScript domain policy/IR，并以 RCL semantic source 补充不变量，再记录为 **RCL_GAP / lowering evidence**；不会宣称 RCL 已完成这些运行时能力的 Canonical 编译或晋升。

## 本次最合理的升级路径

1. **Canonical domain layer**：在 `src/scheduling/` 定义 Worker、Area、Capability、Availability、ServiceRequest、SchedulingCandidate、MatchingPolicy、Booking state machine、Hold 和 idempotency contracts；所有实体强制 `tenantId + verticalId`。
2. **Deterministic scheduling engine**：先做硬约束过滤，再做可配置评分；占用区间统一计算为 `travel + preparation + service + cleanup`，输出候选和可解释 reasons，不调用模型决定硬约束。
3. **Transactional browser/server-shaped service**：提供可注入 Repository 与 clock/id factory；Demo 使用内存/Browser 实现，Confirm 采用 scoped atomic critical section、Hold expiry 和 idempotency；为未来数据库唯一约束保留同一契约。
4. **Privacy Broker**：建立 Job identity、DataCapability、DisclosurePolicy、progressive disclosure、最小化 view 与 PrivacyAuditEvent；排程服务只接收非敏感 Scheduling View，不接收 phone/address。
5. **Conversation Core**：建立 structured intent、Customer/Worker Agent conversation participant、human-only/pause/takeover gate；所有出站 WhatsApp 仍进入既有 Policy Gate 和 Adapter。
6. **UI vertical-neutral integration**：新增 Customer Request、Matching/Hold/Confirm 和 Worker Schedule 页面/面板，使用现有 M3/Shell/Vertical labels；牙科旧页面继续作为兼容投影。
7. **Positive/negative/security tests**：覆盖约束、排序、Hold/Confirm 并发、租户/行业隔离、逐步披露、Agent 越权、STOP/human takeover 与 WhatsApp policy。
8. **Documentation/evidence**：更新 README 与四份架构/威胁模型文档、`EVIDENCE_LEDGER.md`、RCL/DWAC lowering notes；所有结果区分 `PASS`、`CANDIDATE`、`NOT_RUN`、`BLOCKED`，不启动 GitHub Actions。

## 基线验证状态

审计时尚未把本地依赖安装和完整测试结果写成通过证据；后续必须在此分支本地执行可用的 install、lint、typecheck、unit/integration test、build，并将实际输出摘要写入 `EVIDENCE_LEDGER.md`。远程 CI、真实 Meta 账号发送、生产数据库并发和人工视觉验收均不能由本地结果替代。
