import type {
  NewServiceWorkItemInput,
  ServiceWorkItem,
  ServiceWorkItemDispatchReceipt,
  ServiceWorkItemStatus,
} from "@/work-items/types";

const STORAGE_KEY = "service-frontdesk.work-items.v1";
export const SERVICE_WORK_ITEMS_CHANGED_EVENT = "service-frontdesk:work-items-changed";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `wi_${crypto.randomUUID()}`;
  return `wi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export class BrowserServiceWorkItemRepository {
  private readAll(): ServiceWorkItem[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((row): row is ServiceWorkItem => {
        if (!row || typeof row !== "object") return false;
        const value = row as Partial<ServiceWorkItem>;
        return Boolean(
          typeof value.id === "string" &&
            typeof value.tenantId === "string" &&
            typeof value.verticalId === "string" &&
            typeof value.title === "string" &&
            typeof value.status === "string",
        );
      });
    } catch {
      return [];
    }
  }

  private writeAll(rows: ServiceWorkItem[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(SERVICE_WORK_ITEMS_CHANGED_EVENT));
  }

  list(tenantId: string, verticalId: string): ServiceWorkItem[] {
    return clone(
      this.readAll()
        .filter((row) => row.tenantId === tenantId && row.verticalId === verticalId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  get(tenantId: string, id: string): ServiceWorkItem | null {
    const row = this.readAll().find((item) => item.tenantId === tenantId && item.id === id);
    return row ? clone(row) : null;
  }

  add(input: NewServiceWorkItemInput): ServiceWorkItem {
    if (!input.tenantId.trim()) throw new Error("WORK_ITEM_TENANT_REQUIRED");
    if (!input.verticalId.trim()) throw new Error("WORK_ITEM_VERTICAL_REQUIRED");
    if (!input.title.trim()) throw new Error("WORK_ITEM_TITLE_REQUIRED");
    if (!input.intent.trim()) throw new Error("WORK_ITEM_INTENT_REQUIRED");

    const now = new Date().toISOString();
    const item: ServiceWorkItem = {
      id: makeId(),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      kind: input.kind,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      title: input.title.trim(),
      intent: input.intent.trim(),
      basis: clone(input.basis),
      effects: clone(input.effects),
      risk: input.risk,
      status: "waiting_approval",
      ...(input.proposedMessage ? { proposedMessage: input.proposedMessage } : {}),
      ...(input.proposedReplyOptions?.length
        ? { proposedReplyOptions: clone(input.proposedReplyOptions) }
        : {}),
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const rows = this.readAll();
    rows.push(item);
    this.writeAll(rows);
    return clone(item);
  }

  setStatus(
    tenantId: string,
    id: string,
    status: ServiceWorkItemStatus,
    decidedBy?: string,
  ): ServiceWorkItem | null {
    const rows = this.readAll();
    const index = rows.findIndex((row) => row.tenantId === tenantId && row.id === id);
    if (index < 0) return null;
    const current = rows[index]!;
    const now = new Date().toISOString();
    rows[index] = {
      ...current,
      status,
      updatedAt: now,
      ...(status === "ready_to_send" || status === "rejected"
        ? { decidedAt: now, ...(decidedBy ? { decidedBy } : {}) }
        : {}),
    };
    this.writeAll(rows);
    return clone(rows[index]!);
  }

  markDispatched(
    tenantId: string,
    id: string,
    dispatchReceipt: ServiceWorkItemDispatchReceipt,
  ): ServiceWorkItem | null {
    const rows = this.readAll();
    const index = rows.findIndex((row) => row.tenantId === tenantId && row.id === id);
    if (index < 0) return null;
    const current = rows[index]!;
    if (current.status !== "ready_to_send" && current.status !== "done") {
      throw new Error(`WORK_ITEM_NOT_READY_TO_DISPATCH:${current.status}`);
    }
    const now = new Date().toISOString();
    rows[index] = {
      ...current,
      status: "done",
      dispatchReceipt: clone(dispatchReceipt),
      updatedAt: now,
    };
    this.writeAll(rows);
    return clone(rows[index]!);
  }

  findBySource(tenantId: string, verticalId: string, sourceRef: string): ServiceWorkItem | null {
    const row = this.readAll().find(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.sourceRef === sourceRef &&
        item.status !== "rejected",
    );
    return row ? clone(row) : null;
  }
}

export const serviceWorkItemRepository = new BrowserServiceWorkItemRepository();
