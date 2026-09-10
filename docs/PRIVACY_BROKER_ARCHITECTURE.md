# Privacy Broker Architecture

Privacy Broker 是 Job 级别的资料中介。它把“能否看见什么”从 Agent、UI 和 Channel Adapter 中抽离，按参与方、阶段、用途和同意状态逐项裁决。

## 身份模型

每个确认后的 Job 生成不可逆向推断私人资料的展示别名，例如 `Customer #4821` 与 `Worker #7314`。Customer、Worker、Platform Agent 和 Human 都只通过 `jobId` 与 opaque endpoint ref 互通；手机号不作为身份键、候选键或聊天 payload。

敏感值进入独立 secret store（生产库使用加密 payload／secret reference）。公开 Job View 只返回别名、服务摘要、模糊服务区、时段、状态与下一步，不暴露原始地址、门禁说明或手机号。

## Progressive Disclosure

| 阶段                             | 默认可见                                              | 默认不可见                 |
| -------------------------------- | ----------------------------------------------------- | -------------------------- |
| matching                         | 服务摘要、模糊区域、时间、准备要求                    | 精确地址、门禁、双方手机号 |
| booking_confirmed                | 上述资料、确认后的准备信息                            | 精确地址、双方手机号       |
| near_service / service_execution | Worker 按用途取得精确地址；客户按同意取得必要执行信息 | 对方私人电话               |
| 任意阶段                         | Platform Agent 只能拿 opaque channel endpoint         | 真实 endpoint / 手机号     |

精确地址必须同时满足 participant scope、`near_service`／`service_execution`、用途为服务执行以及客户明确同意。私人手机号默认禁止；即使出现“联络方便”等请求，也只允许走平台 Channel Adapter，不能把号码交给另一方。

## Audit 与 retention

每一次 allow／deny 记录 tenant、vertical、job、actor party、stage、capability、reason code、时间和 retention deadline；不记录原始地址、手机号、消息原文或 secret payload。默认 retention：identity 30 天、conversation 180 天、exact address 7 天、audit 365 天；正式租户可通过 policy 覆盖，但不得放宽 participant／purpose／consent 硬门槛。

## 失败边界

Broker 读不到 scope、Job 已过期、同意不清楚、用途不匹配或请求跨 tenant／vertical 时统一拒绝并审计。它不替代数据库 RLS、加密 secret store、密钥轮换、真实身份验证或人工高风险审批。
