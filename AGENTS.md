# Service Frontdesk Core / Clinic Flow 开发边界

本仓库现在分成两层：

1. **Service Frontdesk Core（通用服务业 AI 前台核心）**：负责客户沟通、FAQ、预约／时段、提醒、改期／取消、日历同步、摘要、人工接管、多租户与审计等通用能力；
2. **Vertical Pack（行业包）**：提供行业称谓、服务项目、服务对象字段、授权 FAQ、风险升级词、受限问题、召回规则和外部系统适配目标。

`Clinic Flow` 是当前第一个可运行实例，即 `dental`（牙科）行业包。后续宠物美容／寄养、美容、汽车维修、清洁／家居服务、水电等应复用同一核心。

## 不要复制核心做新行业

新增行业的默认流程：

- 在 `src/verticals/` 增加一个 `ServiceVerticalPack`；
- 注册到 `src/verticals/registry.ts`；
- 如需新的外部系统，只新增 adapter / provider descriptor；
- 除非证明通用契约存在真实缺口，否则不得 fork 一份 FAQ 引擎、预约引擎、WhatsApp 编排或工作台核心。

行业包可以配置业务事实，但**不能扩大 Agent 权限**。

## 当前通用第一阶段

所有预约型服务优先支持：

1. WhatsApp 即时回复商户已授权 FAQ；
2. 预约提醒，以及确认 / 改期 / 取消的一键流程；
3. 高优先级风险关键词标记并通知人员；
4. 简单日历同步；
5. 前台行政／服务对话摘要；
6. 未命中流程 fail-closed（失败关闭）转人工。

Field Service（上门服务）行业在同一核心上增加地址、上门时段、师傅／服务队、报价确认等行业字段，不另造平行系统。

## 牙科行业包

牙科仍是第一个落地目标：

- 继续接在诊所现有 CMS 前面，不替代 DCMS、DentoEase、ClinicSolution；
- 洗牙／覆诊召回属于牙科 vertical 的 follow-up rule，不属于 core；
- 医疗诊断、治疗建议、临床分诊永远不属于前台 Agent 权限；
- 牙科紧急词只做人工升级并保留病人原话。

## 其他行业的专业边界

同一原则迁移到其他行业：

- 宠物服务不做宠物疾病诊断或用药建议；
- 美容服务不做医疗／过敏诊断或治疗建议；
- 汽车维修前台不自主给出危险车辆继续驾驶判断；
- 水电／家居服务前台不提供高风险电力、燃气或危险维修步骤；
- 行业包的 `restrictedQuestionPatterns` 命中后必须转人工。

## 系统整合原则

- 上层 Agent 只能依赖统一 adapter，不直接耦合某家 CMS、CRM、日历或行业 SaaS；
- 未取得真实 API、正式文档或现场验证前，不得声称外部系统已支持某项接口；
- `verifiedCapabilities` 只能在真实验证后增加；
- 当前 GitHub `main` 是唯一源码真相；
- Lovable 只作为 UI 原型 / 视觉调整工具；没有用户明确要求时，不使用 Lovable 做日常开发、测试或重构；
- 测试默认增量执行：普通改动只做受影响模块定向验证；里程碑、部署前或跨模块重构后才跑完整回归。

## 数据与隐私边界

- Core 语义使用 `tenant / customer / subject / service / resource / booking`；现有数据库仍可暂时保留 `clinicId / patientId / Appointment` 兼容字段；
- 所有数据访问必须先按 tenant scope 收窄；
- 真实身份与敏感资料优先留在服务器或客户原有系统；
- Agent 只取得完成当前服务任务所需的最小资料。

## DWAC / RCL

- `dwac/service-frontdesk-core.dpal`：平台化后的 DWAC 预工件目标；
- `dwac/clinic-flow-phase1.dpal`：牙科第一阶段历史目标，继续保留作为 dental vertical 证据；
- `rcl/service-frontdesk-core.rcl`：通用前台权限语义源；
- `rcl/clinic-admin-agent.rcl`：牙科／诊所兼容权限语义源；
- 新功能优先补进现有工件图、Vertical Pack、Adapter、状态机，不另开平行实现。

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to Lovable（界面原型工具）。不要重写已发布的 Git 历史，
> 包括 force push（强制推送）、rebase（变基）、amend（修改既有提交）或 squash（压缩已推送提交）。
> 推送到已连接分支的提交会同步回 Lovable，因此保持分支可运行，但日常开发不依赖 Lovable Agent。
<!-- LOVABLE:END -->
