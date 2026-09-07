import type { WhatsAppTemplateCategory, WhatsAppTemplateRef } from "@/integrations/messaging-adapter";

export type WhatsAppTemplateStatus = "pending" | "approved" | "paused" | "rejected";

export interface WhatsAppTemplateConfig extends WhatsAppTemplateRef {
  tenantId: string;
  status: WhatsAppTemplateStatus;
  updatedAt: string;
}

const STORAGE_KEY = "service-frontdesk.whatsapp-templates.v1";
export const WHATSAPP_TEMPLATES_CHANGED_EVENT = "service-frontdesk:whatsapp-templates-changed";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readAll(): WhatsAppTemplateConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as WhatsAppTemplateConfig[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: WhatsAppTemplateConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(WHATSAPP_TEMPLATES_CHANGED_EVENT));
}

export class BrowserWhatsAppTemplateRegistry {
  list(tenantId: string): WhatsAppTemplateConfig[] {
    return clone(readAll().filter((row) => row.tenantId === tenantId));
  }

  upsert(input: {
    tenantId: string;
    name: string;
    languageCode: string;
    category: WhatsAppTemplateCategory;
    status: WhatsAppTemplateStatus;
  }): WhatsAppTemplateConfig {
    const rows = readAll();
    const next: WhatsAppTemplateConfig = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    const index = rows.findIndex(
      (row) =>
        row.tenantId === input.tenantId &&
        row.name === input.name &&
        row.languageCode === input.languageCode,
    );
    if (index >= 0) rows[index] = next;
    else rows.push(next);
    writeAll(rows);
    return clone(next);
  }

  isApproved(tenantId: string, ref: WhatsAppTemplateRef): boolean {
    return readAll().some(
      (row) =>
        row.tenantId === tenantId &&
        row.name === ref.name &&
        row.languageCode === ref.languageCode &&
        row.category === ref.category &&
        row.status === "approved",
    );
  }
}

export const whatsAppTemplateRegistry = new BrowserWhatsAppTemplateRegistry();
