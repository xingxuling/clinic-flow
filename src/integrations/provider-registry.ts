export type IntegrationCapability =
  | "appointment.read"
  | "appointment.write"
  | "availability.read"
  | "calendar.sync"
  | "patient.lookup"
  | "recall.read";

export type IntegrationReadiness =
  | "demo_ready"
  | "bridge_ready"
  | "vendor_interface_required"
  | "planned";

export interface IntegrationProviderDescriptor {
  id: string;
  displayName: string;
  kind: "clinic_cms" | "calendar" | "manual_bridge";
  readiness: IntegrationReadiness;
  desiredCapabilities: IntegrationCapability[];
  verifiedCapabilities: IntegrationCapability[];
  noteZhHk: string;
}

/**
 * 这张表描述“我们想接什么”，不是声称对方已经提供某个 API。
 * verifiedCapabilities 只有在真实接口、文档或现场验证后才可以增加。
 */
export const integrationProviderRegistry: IntegrationProviderDescriptor[] = [
  {
    id: "clinic-flow-demo",
    displayName: "Clinic Flow 演示资料库",
    kind: "manual_bridge",
    readiness: "demo_ready",
    desiredCapabilities: [
      "appointment.read",
      "appointment.write",
      "availability.read",
      "calendar.sync",
      "patient.lookup",
    ],
    verifiedCapabilities: [
      "appointment.read",
      "appointment.write",
      "availability.read",
      "calendar.sync",
      "patient.lookup",
    ],
    noteZhHk: "第一阶段开发与演示使用，不包含真实病人资料。",
  },
  {
    id: "generic-calendar-bridge",
    displayName: "通用日历桥接",
    kind: "calendar",
    readiness: "bridge_ready",
    desiredCapabilities: ["calendar.sync", "availability.read"],
    verifiedCapabilities: ["calendar.sync"],
    noteZhHk: "先用统一日历适配器完成简单同步；具体供应商认证与授权独立处理。",
  },
  {
    id: "hkda-dcms",
    displayName: "HKDA DCMS",
    kind: "clinic_cms",
    readiness: "vendor_interface_required",
    desiredCapabilities: [
      "appointment.read",
      "appointment.write",
      "availability.read",
      "patient.lookup",
      "recall.read",
    ],
    verifiedCapabilities: [],
    noteZhHk: "等待取得可用整合接口、正式文档或诊所现场环境后再声明能力。",
  },
  {
    id: "dentoease",
    displayName: "DentoEase",
    kind: "clinic_cms",
    readiness: "vendor_interface_required",
    desiredCapabilities: [
      "appointment.read",
      "appointment.write",
      "availability.read",
      "patient.lookup",
      "recall.read",
    ],
    verifiedCapabilities: [],
    noteZhHk: "第一阶段不假设内部 API；优先通过日历或诊所允许的接口桥接。",
  },
  {
    id: "clinicsolution-dental",
    displayName: "ClinicSolution Dental",
    kind: "clinic_cms",
    readiness: "vendor_interface_required",
    desiredCapabilities: [
      "appointment.read",
      "appointment.write",
      "availability.read",
      "patient.lookup",
    ],
    verifiedCapabilities: [],
    noteZhHk: "待真实客户系统版本与可用接口确认后实现专用适配器。",
  },
];
