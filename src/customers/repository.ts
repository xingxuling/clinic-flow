import type { NewServiceCustomerInput, ServiceCustomer } from "@/customers/types";

export interface ServiceCustomerRepository {
  list(tenantId: string): ServiceCustomer[];
  get(tenantId: string, customerId: string): ServiceCustomer | null;
  add(input: NewServiceCustomerInput): ServiceCustomer;
  update(tenantId: string, customerId: string, patch: Partial<ServiceCustomer>): ServiceCustomer | null;
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
      return parsed.filter((row): row is ServiceCustomer => {
        if (!row || typeof row !== "object") return false;
        const value = row as Partial<ServiceCustomer>;
        return Boolean(
          typeof value.id === "string" &&
            typeof value.tenantId === "string" &&
            typeof value.displayName === "string" &&
            typeof value.phone === "string",
        );
      });
    } catch {
      return [];
    }
  }

  private writeAll(rows: ServiceCustomer[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent("service-frontdesk:customers-changed"));
  }

  list(tenantId: string): ServiceCustomer[] {
    return clone(
      this.readAll()
        .filter((row) => row.tenantId === tenantId)
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
    if (!input.displayName.trim()) throw new Error("CUSTOMER_NAME_REQUIRED");
    if (phone.length < 6) throw new Error("CUSTOMER_PHONE_INVALID");

    const rows = this.readAll();
    const duplicate = rows.find(
      (row) => row.tenantId === input.tenantId && normalizePhone(row.phone) === phone,
    );
    if (duplicate) throw new Error(`CUSTOMER_PHONE_DUPLICATE:${duplicate.id}`);

    const customer: ServiceCustomer = {
      id: makeId(),
      tenantId: input.tenantId,
      displayName: input.displayName.trim(),
      phone,
      preferredChannel: input.preferredChannel ?? "whatsapp",
      language: input.language ?? "zh-HK",
      tags: [...(input.tags ?? [])],
      notesAdmin: input.notesAdmin ?? "",
      subjects: clone(input.subjects ?? []),
      followUp: input.followUp ? clone(input.followUp) : undefined,
      source: input.source,
      sourceRef: input.sourceRef,
      createdAt: now,
      updatedAt: now,
    };
    rows.push(customer);
    this.writeAll(rows);
    return clone(customer);
  }

  update(tenantId: string, customerId: string, patch: Partial<ServiceCustomer>): ServiceCustomer | null {
    const rows = this.readAll();
    const index = rows.findIndex((row) => row.tenantId === tenantId && row.id === customerId);
    if (index < 0) return null;
    rows[index] = {
      ...rows[index],
      ...clone(patch),
      id: rows[index]!.id,
      tenantId: rows[index]!.tenantId,
      updatedAt: new Date().toISOString(),
    };
    this.writeAll(rows);
    return clone(rows[index]!);
  }
}

export const serviceCustomerRepository = new BrowserServiceCustomerRepository();
export { normalizePhone };
