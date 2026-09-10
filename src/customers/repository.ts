import type { NewServiceCustomerInput, ServiceCustomer } from "@/customers/types";

export interface ServiceCustomerRepository {
  list(tenantId: string, verticalId?: string): ServiceCustomer[];
  get(tenantId: string, customerId: string): ServiceCustomer | null;
  add(input: NewServiceCustomerInput): ServiceCustomer;
  update(
    tenantId: string,
    customerId: string,
    patch: Partial<ServiceCustomer>,
  ): ServiceCustomer | null;
}

const STORAGE_KEY = "service-frontdesk.customers.v1";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("852") && digits.length === 11) return digits.slice(3);
  return digits;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `cus_${crypto.randomUUID()}`;
  }
  return `cus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export class BrowserServiceCustomerRepository implements ServiceCustomerRepository {
  private readAll(): ServiceCustomer[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((row): row is ServiceCustomer => {
          if (!row || typeof row !== "object") return false;
          const value = row as Partial<ServiceCustomer>;
          return Boolean(
            typeof value.id === "string" &&
            typeof value.tenantId === "string" &&
            typeof value.displayName === "string" &&
            typeof value.phone === "string",
          );
        })
        .map((row) => ({
          ...row,
          // v1 early demo rows predated vertical isolation and originated from the dental-only prototype.
          verticalId:
            typeof row.verticalId === "string" && row.verticalId ? row.verticalId : "dental",
        }));
    } catch {
      return [];
    }
  }

  private writeAll(rows: ServiceCustomer[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent("service-frontdesk:customers-changed"));
  }

  list(tenantId: string, verticalId?: string): ServiceCustomer[] {
    return clone(
      this.readAll()
        .filter(
          (row) => row.tenantId === tenantId && (!verticalId || row.verticalId === verticalId),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }

  get(tenantId: string, customerId: string): ServiceCustomer | null {
    const row = this.readAll().find((item) => item.tenantId === tenantId && item.id === customerId);
    return row ? clone(row) : null;
  }

  add(input: NewServiceCustomerInput): ServiceCustomer {
    const now = new Date().toISOString();
    const phone = normalizePhone(input.phone);
    if (!input.tenantId.trim()) throw new Error("CUSTOMER_TENANT_REQUIRED");
    if (!input.verticalId.trim()) throw new Error("CUSTOMER_VERTICAL_REQUIRED");
    if (!input.displayName.trim()) throw new Error("CUSTOMER_NAME_REQUIRED");
    if (phone.length < 6) throw new Error("CUSTOMER_PHONE_INVALID");

    const rows = this.readAll();
    const duplicate = rows.find(
      (row) =>
        row.tenantId === input.tenantId &&
        row.verticalId === input.verticalId &&
        normalizePhone(row.phone) === phone,
    );
    if (duplicate) throw new Error(`CUSTOMER_PHONE_DUPLICATE:${duplicate.id}`);

    const customer: ServiceCustomer = {
      id: makeId(),
      tenantId: input.tenantId,
      verticalId: input.verticalId,
      displayName: input.displayName.trim(),
      phone,
      preferredChannel: input.preferredChannel ?? "whatsapp",
      language: input.language ?? "zh-HK",
      tags: [...(input.tags ?? [])],
      notesAdmin: input.notesAdmin ?? "",
      subjects: clone(input.subjects ?? []),
      ...(input.followUp ? { followUp: clone(input.followUp) } : {}),
      source: input.source,
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      createdAt: now,
      updatedAt: now,
    };
    rows.push(customer);
    this.writeAll(rows);
    return clone(customer);
  }

  update(
    tenantId: string,
    customerId: string,
    patch: Partial<ServiceCustomer>,
  ): ServiceCustomer | null {
    const rows = this.readAll();
    const index = rows.findIndex((row) => row.tenantId === tenantId && row.id === customerId);
    if (index < 0) return null;
    const current = rows[index]!;
    const next = { ...current };
    Object.assign(next, clone(patch));
    next.id = current.id;
    next.tenantId = current.tenantId;
    next.verticalId = current.verticalId;
    next.updatedAt = new Date().toISOString();
    rows[index] = next;
    this.writeAll(rows);
    return clone(rows[index]!);
  }
}

export const serviceCustomerRepository = new BrowserServiceCustomerRepository();
export { normalizePhone };
