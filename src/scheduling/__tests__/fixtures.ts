import type { NewServiceWorkItemInput, ServiceWorkItem } from "@/work-items/types";
import type { CreateServiceRequestInput } from "@/scheduling/runtime";
import type { ServiceRequest, Worker } from "@/scheduling/types";

export const TEST_TENANT = "tenant_demo";
export const TEST_VERTICAL = "home-service";
export const TEST_AREA = {
  areaId: "area:tenant_demo:central",
  label: "Central service area",
};
export const TEST_NOW = new Date("2026-09-10T09:00:00.000Z");

export function testWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    workerId: "worker_01",
    tenantId: TEST_TENANT,
    verticalId: TEST_VERTICAL,
    displayName: "Worker One",
    status: "active",
    serviceAreaIds: [TEST_AREA.areaId],
    capabilities: [
      {
        serviceTypeId: "cleaning",
        defaultDurationMin: 60,
        minDurationMin: 30,
        maxDurationMin: 180,
      },
    ],
    weeklyAvailability: [{ weekday: 4, startTime: "08:00", endTime: "18:00" }],
    availabilityExceptions: [],
    defaultTravelBufferMin: 15,
    preparationBufferMin: 10,
    cleanupBufferMin: 10,
    rating: 4.8,
    historicalReliability: 0.9,
    ...overrides,
  };
}

export function testRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    requestId: "request_01",
    tenantId: TEST_TENANT,
    verticalId: TEST_VERTICAL,
    customerId: "customer_01",
    serviceType: "cleaning",
    serviceItems: [{ serviceType: "cleaning" }],
    approximateArea: TEST_AREA,
    requestedDate: "2026-09-10",
    requestedTime: "10:00",
    urgency: "normal",
    requirements: ["bring eco-friendly supplies"],
    attachments: [],
    specialConstraints: [],
    privacyLevel: "standard",
    status: "draft",
    createdAt: TEST_NOW.toISOString(),
    updatedAt: TEST_NOW.toISOString(),
    ...overrides,
  };
}

export function testCreateRequestInput(
  overrides: Partial<CreateServiceRequestInput> = {},
): CreateServiceRequestInput {
  return {
    tenantId: TEST_TENANT,
    verticalId: TEST_VERTICAL,
    customerId: "customer_01",
    serviceType: "cleaning",
    approximateArea: TEST_AREA,
    requestedDate: "2026-09-10",
    requestedTime: "10:00",
    requirements: ["bring eco-friendly supplies"],
    ...overrides,
  };
}

export class RecordingWorkItemSink {
  readonly items: ServiceWorkItem[] = [];

  add(input: NewServiceWorkItemInput): ServiceWorkItem {
    const now = TEST_NOW.toISOString();
    const item: ServiceWorkItem = {
      id: `work_item_${this.items.length + 1}`,
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      kind: input.kind,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      title: input.title,
      intent: input.intent,
      basis: [...input.basis],
      effects: [...input.effects],
      risk: input.risk,
      status: "waiting_approval",
      ...(input.proposedMessage ? { proposedMessage: input.proposedMessage } : {}),
      ...(input.proposedReplyOptions
        ? { proposedReplyOptions: [...input.proposedReplyOptions] }
        : {}),
      ...(input.messagePurpose ? { messagePurpose: input.messagePurpose } : {}),
      ...(input.whatsappTemplate ? { whatsappTemplate: { ...input.whatsappTemplate } } : {}),
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    return structuredClone(item);
  }
}

export function deterministicIdFactory(): (prefix: string) => string {
  let count = 0;
  return (prefix) => `${prefix}_${++count}`;
}
