# Clinic Flow 开发边界

Clinic Flow 的第一定位是：**接在牙科诊所现有 CMS（诊所管理系统）前面的 AI 客户端 / AI 前台**。

## 不要漂移成另一套 CMS

第一阶段优先级固定为：

1. WhatsApp 即时回复诊所已授权 FAQ；
2. 预约提醒，以及确认 / 改期 / 取消的一键流程；
3. 潜在紧急关键词标记并立即通知诊所人员；
4. 简单日历同步；
5. 前台行政对话摘要。

第二阶段才做：

- 洗牙 / 覆诊自动召回；
- 更深入的 CMS 整合；
- 更强的行政自动化。

保险、文件、财务等既有模块可以保留，但默认不是第一阶段产品中心。

## 系统整合原则

- 上层 Agent 只能依赖统一适配器，不得直接耦合 DCMS、DentoEase、ClinicSolution 或某个日历供应商。
- 未取得真实 API、正式文档或现场验证前，不得声称某个外部系统已支持某项接口。
- 当前 GitHub `main` 是唯一源码真相。
- Lovable 只作为 UI 原型 / 视觉调整工具；没有用户明确要求时，不使用 Lovable 做日常开发、测试或重构。
- 测试默认增量执行：普通改动只做受影响模块的定向验证；里程碑、部署前或跨模块重构后才跑完整回归。

## 医疗与隐私边界

- Agent 不做医学诊断、治疗建议或自动临床分诊结论。
- 潜在紧急讯息只做规则标记与人工升级，必须保留病人原话。
- FAQ 自动回复只能来自诊所明确授权的行政答案；未知问题 fail-closed（失败关闭）转人工。
- 数据默认按 `clinicId + patientId` 收窄。
- 真实身份与敏感资料优先留在服务器 / 原有 CMS；Agent 只取得完成行政任务所需的最小资料。

## DWAC / RCL

- `dwac/clinic-flow-phase1.dpal` 是第一阶段 DWAC 预工件目标。
- `rcl/clinic-admin-agent.rcl` 是 Agent 权限语义边界之一。
- 新功能优先补进现有工件图 / 适配器 / 状态机，而不是另开平行实现。

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to Lovable（界面原型工具）。不要重写已发布的 Git 历史，
> 包括 force push（强制推送）、rebase（变基）、amend（修改既有提交）或 squash（压缩已推送提交）。
> 推送到已连接分支的提交会同步回 Lovable，因此保持分支可运行，但日常开发不依赖 Lovable Agent。
<!-- LOVABLE:END -->
