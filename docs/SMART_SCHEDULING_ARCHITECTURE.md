# Smart Scheduling & Privacy Broker Core

Clinic Flow 目前的通用核心是 Service Frontdesk Core；牙科只是其中一个 Vertical Pack。本阶段把上门／现场服务排程抽成可复用语义，保留牙科旧 Appointment 适配层，不另起平行核心。

## 运行边界

所有请求、Worker、Hold、Booking、Job Conversation 都必须同时带 `tenantId` / `clinic_id` 与 `verticalId`。任一 scope 不一致即 fail closed。Worker 的能力、服务区、时区、每周档期、例外和显式 schedule block 属于 scheduling core；行业服务定义与默认 buffer 属于 Vertical Pack。

```text
Customer Request
      │ service / area / time / urgency / constraints
      ▼
Hard filters ── tenant + vertical + active + capability + area + availability
      ▼
Weighted ranking ── time + geo + capability + workload + urgency + preference
      │              + reliability + travel + schedule efficiency
      ▼
Offer → Schedule Hold → Customer Confirm → Worker Notify → Scheduled
                                      │
                                      └─ Privacy Job Context + dual Agent conversation
```

## 时间与缓冲

`serviceStartAt/serviceEndAt` 是客户看到的服务时段；`reservedStartAt/reservedEndAt` 才是 Worker 的不可重叠锁定窗口：

`reservedStart = serviceStart - travelBuffer - preparationBuffer`

`reservedEnd = serviceEnd + cleanupBuffer`

请求只给 `requestedDate + requestedTime` 时，时间是“首选服务开始时间”，当天仍是搜索窗口；请求给出完整窗口时，候选必须完整落在窗口内。所有候选在时区转换为 instant 后再做重叠判断。

## Hold / Confirm / Lock

浏览器 Demo 使用 `InMemorySchedulingRepository` / `BrowserSchedulingRepository` 演示幂等和状态机。它不是跨标签页原子事务，也不是生产排程证据。

生产 lowering 在 `db/migrations/0003_smart_scheduling_privacy_core.sql`：

- `schedule_holds` 与 `service_schedule_bookings` 各自有按 tenant、vertical、worker 和 `tstzrange` 的 GiST exclusion constraint。
- `app_private.confirm_schedule_hold` 在事务内锁定 Worker slot，并再次检查 Hold／Booking 重叠，关闭跨表竞争窗口。
- Hold 与 Confirm 均要求幂等键；通知失败进入 `FAILED`，不返回虚假成功。
- Confirm 成功会复用既有 Service Work Item organ 建立 booking review／notification work item；它不直接发送消息，避免产生第二套出站系统。
- RLS 使用数据库 session context 推导 tenant／vertical，不能信任浏览器传来的 clinic id。

## 可替换执行层

匹配算法是纯 TypeScript lowering；正式持久化与并发锁由 PostgreSQL 负责。未来可接路由／地理服务，但 provider 只能提供距离证据，不能改变 tenant、vertical、能力或隐私裁决。

本地 UI 的示范 Worker 是从既有 Staff 资料生成的 synthetic capability data，状态标记为 candidate；没有真实排班、真实客户或外部 Provider 证据时，不宣称生产可用。
