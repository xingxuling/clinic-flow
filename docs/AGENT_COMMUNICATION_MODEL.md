# Dual Agent Communication Model

一个 Job 有两个受限 Agent 角色：

- Customer Agent：整理客户需求、说明已确认的时间／服务信息、接收改期／取消／到达等结构化意图。
- Worker Agent：发送工作摘要、接收出发／到达／延误／完成和替代时段提议。

二者共享 Job scope、状态和结构化 intent，但不共享私人联系人资料，不可跨 Job 传播消息，也不能直接调用 Channel provider。

## Intent contract

消息先经过确定性分类器生成 `{kind, confidence, payload, requiresHuman}`。目前覆盖 availability、change time、information、price、photo、delay、arrival、cancel、reschedule、complete、private contact 和 unknown。解析失败、风险词、隐私请求或涉及高风险行业判断时进入 `waiting_human`。

Agent 只能提出 proposal 或生成下一步意图；实际 Hold、Confirm、Cancel、Reschedule、通知发送仍由服务层状态机和 Channel policy 执行。`CREATE_TIME_CHANGE_REQUEST` 不等于已改期，`CREATE_ALTERNATIVE_TIME_PROPOSAL` 不等于已锁定。

确认后的通知会进入既有 Service Work Item organ；Work Item 只保存 Job／Booking 的非敏感依据，实际 provider 投递仍须走统一 Channel Adapter 和原有 WhatsApp policy。

## Takeover

Customer 或 Worker 可以触发人工接管。进入 `human_only` 后 Agent 不再抢答；恢复必须由显式操作发起。Conversation Core 记录 pause／takeover／resume／close，不保存未经 Broker 裁决的私人联系方式。

## Channel federation

现有 `MessagingAdapter` 是 WhatsApp、电话和网页的统一发送边界；新增 `JobChannelAdapter` 只接收 opaque endpoint ref。WhatsApp 仍必须通过既有 24 小时窗口、opt-in、STOP、template 和官方 Business Platform gate；本阶段排程 Agent 只入队通知 intent，不绕过这些 policy。
