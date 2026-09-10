# Service Frontdesk Core + Clinic Flow

**Service Frontdesk Core** 是一个面向服务行业的多租户 AI 前台核心：接在商户现有预约系统、CMS、CRM、日历或人工流程之前，负责客户沟通与重复前台工作，而不是要求商户更换整套后台系统。

**Clinic Flow** 是当前第一个可运行实例：`Dental Vertical Pack（牙科行业包）`。

当前同时提供候选行业包，用于验证核心是否可以复制到其他服务行业：

- 宠物美容／寄养
- 清洁／家居／水电上门服务
- 美容／护理
- 汽车维修／保养

> 当前仓库仍处于开发 / Demo 阶段。全部演示客户、病人、讯息、预约与文件资料均为虚构；外部供应商能力只有在真实接口或现场验证后才会标记为 verified。

---

## 1. 产品模型

核心不以“牙科”建模，而使用一组通用服务语义：

```text
Customer（客户）
   +
Subject（服务对象：本人 / 宠物 / 车辆 / 地址）
   +
Service（服务项目）
   +
Resource（医生 / 美容师 / 技师 / 师傅 / 房间 / 工位）
   +
Booking（预约 / 入厂 / 上门时段）
   +
Conversation（客户对话）
   +
Follow-up（提醒 / 召回 / 再次服务）
```

平台结构：

```text
WhatsApp / Web / Phone
          ↓
Service Frontdesk Core
├─ 授权 FAQ
├─ 预约 / 改期 / 取消
├─ 提醒
├─ 高优先级风险升级
├─ 对话摘要
├─ 人工接管
└─ 审计 / 多租户边界
          ↓
Adapters
├─ Calendar
├─ CMS / CRM
├─ Booking System
└─ Manual Bridge
          ↓
Vertical Pack
├─ dental
├─ pet-care
├─ home-service
├─ beauty
└─ auto-repair
```

新增行业的默认方式是**增加 Vertical Pack，而不是复制一套 Core**。

---

## 2. 当前第一阶段能力

通用预约型服务优先完成：

1. WhatsApp 即时回复商户已授权 FAQ；
2. 预约提醒；
3. 一键确认 / 改期 / 取消；
4. 改期时自动查询可用时段；
5. 高优先级关键词触发人工升级；
6. 简单日历同步；
7. 前台对话摘要；
8. 未命中授权流程时 fail-closed（失败关闭）转人工。

本阶段同时加入通用 `Smart Scheduling & Privacy Broker Core`：

9. 服務請求、服務人員能力／地區／可用時間與移動／準備／清理緩衝；
10. 硬約束過濾、可配置候選排序、原因解釋與租戶時區；
11. 五分鐘政策控制 Hold、正式 Booking 狀態機、Confirm 冪等與不重複排程；
12. Job-scoped Customer #… / Worker #… 身份、漸進式隱私披露與 Privacy Audit；
13. Customer Agent / Worker Agent 結構化意圖、人工接管與 WhatsApp STOP 控制。

上门服务型行业复用同一核心，并由行业包增加：地址、现场联系人、师傅／服务队、上门时段、报价确认等字段。

---

## 3. Clinic Flow：牙科行业包

牙科仍是首个真实落地方向，但定位是：

> **接在诊所现有 CMS 前面的 AI 前台，而不是再造一套牙科 CMS。**

当前牙科行业包包含：

- 牙科服务项目；
- 牙科授权 FAQ 模板；
- 潜在紧急关键词；
- 医疗判断 / 用药 / 治疗问题的人工转交规则；
- 6 / 12 个月洗牙召回规则；
- HKDA DCMS、DentoEase、ClinicSolution Dental 的候选整合目标。

这些外部系统目前的 `verifiedCapabilities` 保持为空；未取得接口、正式文档或真实客户现场验证前，不声称已完成整合。

---

## 4. Vertical Pack（行业包）

核心契约位于：

```text
src/verticals/types.ts
src/verticals/registry.ts
```

当前行业包：

```text
src/verticals/dental.ts
src/verticals/pet-care.ts
src/verticals/home-service.ts
src/verticals/beauty.ts
src/verticals/auto-repair.ts
src/verticals/regulated-health.ts
```

每个行业包可以定义：

- 客户 / 服务对象 / 资源 / 预约等界面称谓；
- 服务项目；
- 服务对象字段；
- 商户授权 FAQ；
- 高优先级升级关键词；
- 必须转人工的受限问题；
- 跟进 / 召回规则；
- 外部系统适配目标；
- 改期 / 取消需要人工确认的提前时间。

行业包**不能扩大 Agent 权限**。

例如：

- 牙科不做医学诊断、治疗建议或临床分诊；
- 宠物服务不做宠物疾病诊断或用药建议；
- 美容不做医疗 / 过敏诊断；
- 汽车维修前台不自主判断危险车辆是否可继续驾驶；
- 水电 / 家居服务前台不提供高风险电力、燃气或危险维修步骤。

---

## 5. 通用前台 Core

主要代码：

```text
src/core/tenant.ts                 ServiceTenant 通用租户模型
src/core/escalation.ts             通用高优先级升级规则
src/frontdesk/faq-engine.ts        授权 FAQ 引擎
src/frontdesk/frontdesk-agent.ts   行业包驱动的前台规划器
src/frontdesk/inbound-service.ts   WhatsApp / Web 入站闭环
src/frontdesk/conversation-summary.ts
src/frontdesk/appointment-reminder.ts
src/frontdesk/appointment-actions.ts
src/frontdesk/appointment-interaction-service.ts
src/scheduling/types.ts             通用 ServiceRequest / Worker / Hold / Job IR
src/scheduling/matching.ts           硬約束過濾與可配置候選排序
src/scheduling/state-machine.ts      Booking 狀態機
src/scheduling/runtime.ts            Hold / Confirm / 通知意圖 / 回滾候選運行時
src/privacy/broker.ts                漸進式資料披露與 Privacy Audit
src/conversations/job-intent.ts      雙 Agent ConversationIntent 與人手接管
src/scheduling/notification-dispatch.ts  WhatsApp Policy Gate 通道邊界
```

新通用 API：

```ts
planServiceFrontdeskMessage(...)
processServiceFrontdeskInboundMessage(...)
```

第一版牙科 API 仍保留作为兼容入口，避免平台化重构一次性破坏现有 Demo。

---

## 6. Adapter（适配器）边界

```text
src/integrations/messaging-adapter.ts
src/integrations/appointment-adapter.ts
src/integrations/calendar-adapter.ts
src/integrations/provider-registry.ts
```

Core 不直接知道 DCMS、DentoEase、Google Calendar 或某家 SaaS 的内部 API。

统一原则：

```text
Frontdesk Core
      ↓
Stable Adapter Contract
      ↓
具体供应商 Adapter
```

因此未来一个行业拿下后，复制到下一行业主要是换 Vertical Pack 与供应商 Adapter，不重写前台核心。

---

## 7. UI / 产品面

现有可点击 Demo 仍以牙科 `Clinic Flow` 为主，使用 Material Design 3：

- `/patient/*`：病人前台；
- `/staff/*`：诊所职员后台；
- 手机 Bottom Navigation；
- 桌面 Navigation Rail / Drawer；
- 今日工作台；
- 对话中心；
- 预约中心；
- `/staff/bookings`：通用智能排程（請求收集、Worker Schedule、候選解釋、Hold、Confirm、Job Conversation）；
- `/staff/appointments`：既有牙科预约兼容頁；
- 提醒 / 召回；
- Agent 任务；
- 审计 / 权限 / 设置。

平台化当前优先抽象语义和工作流，不为了改名而一次性破坏这套牙科 Demo。未来其他 Vertical 可以复用 M3 组件，并由行业包提供界面文案和字段。

---

## 8. 安全与权限

已有 / 正在建设的安全层：

- 病人 / 员工双端路由与身份分离；
- 短时签名入口 Token；
- HttpOnly Session 服务器会话骨架；
- PostgreSQL 多租户 Schema；
- Row Level Security（RLS，行级安全）骨架；
- Agent 封闭动作集合；
- 中 / 高风险动作人工批准；
- 审计日志；
- 租户不匹配 fail-closed；
- Vertical Pack 不得扩大 Agent 专业判断权限。
- Privacy Broker 預設不披露私人電話；完整地址只可在近服務階段、目的綁定及客户 subject 綁定同意後由 Private Data Vault 提供。
- Job Agent 必須帶實際 Customer / Worker subject ID；公開 Job ID 不構成身份驗證。
- WhatsApp 主動通知必須經既有 Policy Gate、opt-in / STOP / human-only、24 小時窗口與模板規則。

通用 RCL 权限语义源：

```text
rcl/service-frontdesk-core.rcl
```

牙科兼容语义源：

```text
rcl/clinic-admin-agent.rcl
```

---

## 9. DWAC 工件目标

平台化预工件目标：

```text
dwac/service-frontdesk-core.dpal
```

牙科第一阶段历史目标：

```text
dwac/clinic-flow-phase1.dpal
```

本地曾使用用户提供的 DWAC 构建包对平台化 DPAL 做结构编译：CLI 成功生成 8 个 Semantic Work Units、4 个执行波次、critical path depth 4；但参考 worker **没有通过**我们自定义的 `vertical_neutral` / `tenant_scoped` 验收，因此该结果只视为 `CANDIDATE`，不宣称 DWAC 已完成正式验收或 canonical promotion。

---

## 10. 数据层

现阶段为了保持 Clinic Flow Demo 可运行，旧领域模型仍包含：

```text
Clinic / Patient / Appointment
clinicId / patientId
```

通用 Core 已新增：

```text
ServiceTenant
Customer / Subject / Service / Resource / Booking 语义
```

数据库不会为了“名字更漂亮”立即进行破坏式重命名。后续通过兼容层 / 新迁移逐步把持久化模型升级成通用服务模型。

PostgreSQL 迁移：

```text
db/migrations/0001_clinic_flow_core.sql
db/migrations/0002_harden_fk_and_patient_writes.sql
db/migrations/0003_smart_scheduling_privacy_broker.sql
```

`0003` 保持既有 Clinic Flow 兼容表，新增 generic worker、request、統一
schedule reservation、booking、Job、Privacy Context、Privacy Audit 與通知意圖表。
其中 PostgreSQL exclusion constraint 是服務人員占用區間的資料庫級不重複排程閘門；本地尚未連接真實資料庫執行此 migration。

---

## 11. 开发与测试策略

技术栈：

- TypeScript strict
- React 19
- TanStack Start / Router
- Tailwind CSS v4
- Material Design 3
- Vitest
- PostgreSQL（目标正式数据层）

常用指令：

```bash
bun run dev
bun run build
bunx vitest run
bunx tsc --noEmit
```

本階段定向測試：

```bash
bunx vitest run src/scheduling/__tests__ src/privacy/__tests__ src/conversations/__tests__
```

不使用 GitHub Actions 冒充本地或生产证据；完整状态、已知基线失败与浏览器烟雾证据见 [`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md)。

但日常开发**不要求每次提交都跑完整测试**：

- 小改动：定向测试 / 类型检查；
- 跨模块改动：相关链路测试；
- 安全边界：对应安全测试；
- 里程碑 / 部署 / 大重构：完整回归。

当前新增的行业抽象定向测试：

```text
src/verticals/__tests__/vertical-packs.test.ts
```

它验证牙科、宠物、家居、美容、汽车行业包能共享同一个前台 Core，并验证跨租户消息不会进入自动发送流程。

本阶段架构与证据文档：

```text
docs/SMART_SCHEDULING_ARCHITECTURE.md
docs/SCHEDULING_STATE_MACHINE.md
docs/PRIVACY_BROKER_ARCHITECTURE.md
docs/AGENT_COMMUNICATION_MODEL.md
docs/PRIVACY_THREAT_MODEL.md
EVIDENCE_LEDGER.md
```

---

## 12. 当前状态

已经成立的方向：

```text
Service Frontdesk Core
        +
Dental Vertical = Clinic Flow
```

候选复制路径：

```text
Pet Care Vertical
Home Service Vertical
Beauty Vertical
Auto Repair Vertical
```

本阶段实现状态：

- `SmartSchedulingPage` 已接入 `/staff/bookings`，本地浏览器已验证登录、请求、候选、Hold、Confirm 与 Job Agent 视图；
- 核心单元测试已覆盖 38 个调度／隐私／Agent／WhatsApp 边界用例；
- PostgreSQL migration、真实后端 transaction、真实 Private Data Vault、Meta/WhatsApp 生产发送与视觉验收仍未验证；
- RCL / DWAC 已补充语义与工件单元，但新能力仍标记 `CANDIDATE_ONLY`，没有宣称 canonical promotion。

下一阶段优先事项是：

1. 将预约提醒 / Booking 文案进一步 Vertical 化；
2. 将现有 UI 的牙科字段逐步抽成行业 Presentation Model；
3. 将 PostgreSQL Repository 接到真实服务器；
4. 接入一个真实 WhatsApp Business 测试渠道；
5. 选择第一家真实商户，用现场流程验证一个 Vertical；
6. 用第二个行业验证“只换行业包即可复制”的假设。

GitHub `main` 是当前唯一源码真相。Lovable 只用于明确需要的 UI 原型 / 视觉调整，不承担日常开发与测试。
