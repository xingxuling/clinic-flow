# Scheduling State Machine

## Service Request

```text
DRAFT → MATCHING → OFFERED → HELD → CUSTOMER_CONFIRMED
                                      → WORKER_NOTIFIED → SCHEDULED
                                                        → IN_PROGRESS → COMPLETED
```

异常或人工流程：

- `OFFERED → DECLINED`
- `HELD → EXPIRED`
- `HELD → FAILED`
- `SCHEDULED / IN_PROGRESS → RESCHEDULE_REQUIRED`
- 非终态 → `CANCELLED`（具体取消规则由服务端 policy 决定）
- `RESCHEDULE_REQUIRED / FAILED / DECLINED → MATCHING` 允许重新进入匹配

终态是 `COMPLETED`、`CANCELLED`、`EXPIRED`、`DECLINED`、`FAILED`；终态不能被普通 Agent 直接覆盖。

## Hold / Booking

`ScheduleHold` 只有 `ACTIVE → CONFIRMED | EXPIRED | RELEASED`。Active Hold 只占用带 buffer 的完整 reserved range；过期时释放并把对应 Request 标为 `EXPIRED`。

`ServiceScheduleBooking` 由 Confirm 原子创建，正常流为 `SCHEDULED → IN_PROGRESS → COMPLETED`，通知或持久化失败为 `FAILED`，取消为 `CANCELLED`。相同 idempotency key 的重复 Confirm 只返回原 Booking，不重复写入或通知。

任何状态推进都必须带 tenant／vertical scope，并写入结构化 audit；UI 的“成功”以服务层 receipt 为准，不以按钮点击或本地 optimistic state 为准。
