# Privacy Broker Threat Model

## Assets

- 客户／Worker 的真实手机号、精确上门地址、门禁说明和附件。
- Job 身份关联、服务时间、路由 endpoint 和披露审计。
- 租户边界、Vertical 边界与客户同意记录。

## Threats and controls

| Threat                               | Control                                                          | Residual evidence gap                        |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------- |
| Agent 把客户和 Worker 的号码直接交换 | Broker 默认 deny；只允许 opaque endpoint                         | 真实 provider/BSP 仍需现场验证               |
| 跨租户读取 Job 或 audit              | 每个运行时对象带 tenant+vertical；Postgres RLS + session context | 本地浏览器不是数据库 RLS                     |
| 过早泄露精确地址                     | stage + purpose + consent 三重条件                               | 需真实同意记录与服务执行时钟                 |
| Audit 日志泄露原文                   | 只写 capability/reason/metadata，secret 独立                     | 生产 secret store 加密与 key rotation 未部署 |
| 两个客户确认同一 Worker 时段         | GiST range exclusion + worker advisory xact lock                 | 尚未在真实 Postgres 集群压测                 |
| 重复 webhook／Confirm 造成重复通知   | provider id / idempotency key / hold_id 去重                     | 分布式队列重试需真实 provider 演练           |
| WhatsApp 业务消息绕过政策            | 复用已有 opt-in、STOP、24h、template、official provider gate     | Meta/BSP 账号证据仍未提供                    |

## Security posture

本阶段提供 candidate-level 的 fail-closed 逻辑、静态 SQL lowering 和单元安全测试；没有把 localStorage、构建产物或模拟 Channel receipt 当作生产隐私合规、真实并发或运营安全证明。
