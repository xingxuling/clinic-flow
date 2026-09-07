import type { ServiceCustomer } from "@/customers/types";

export type ContactSyncStatus = "synced" | "exported" | "unsupported";

export interface ContactSyncResult {
  status: ContactSyncStatus;
  providerId: string;
  detail: string;
}

export interface ContactSink {
  id: string;
  available: boolean;
  save(customer: ServiceCustomer): Promise<ContactSyncResult>;
}

function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function customerToVCard(customer: ServiceCustomer): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(customer.displayName)}`,
    `TEL;TYPE=CELL:${escapeVCard(customer.phone)}`,
    customer.notesAdmin ? `NOTE:${escapeVCard(customer.notesAdmin)}` : "",
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/**
 * 标准 Web/PWA 没有通用的“静默写入系统通讯录”能力。
 * 浏览器 fallback 只导出 vCard；原生 App、CRM、Google/Microsoft Contacts
 * 以后实现同一 ContactSink 即可真正同步。
 */
export class BrowserVCardContactSink implements ContactSink {
  id = "browser.vcard";
  available = typeof window !== "undefined";

  async save(customer: ServiceCustomer): Promise<ContactSyncResult> {
    if (typeof window === "undefined") {
      return { status: "unsupported", providerId: this.id, detail: "瀏覽器環境不可用" };
    }
    const blob = new Blob([customerToVCard(customer)], { type: "text/vcard;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${customer.displayName || "contact"}.vcf`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    return {
      status: "exported",
      providerId: this.id,
      detail: "已匯出 vCard；手機可開啟檔案加入通訊錄。",
    };
  }
}

export const contactSink: ContactSink = new BrowserVCardContactSink();
