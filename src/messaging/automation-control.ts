export type CustomerAutomationMode = "agent_allowed" | "human_only";
export type WhatsAppConsentState = "unknown" | "opted_in" | "opted_out";

export interface TenantAutomationControl {
  tenantId: string;
  agentEnabled: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface CustomerMessagingControl {
  tenantId: string;
  verticalId: string;
  customerId: string;
  automationMode: CustomerAutomationMode;
  whatsappConsent: WhatsAppConsentState;
  optInAt?: string;
  optOutAt?: string;
  lastCustomerMessageAt?: string;
  updatedAt: string;
  updatedBy?: string;
  reason?: string;
}

const TENANT_KEY = "service-frontdesk.tenant-automation.v1";
const CUSTOMER_KEY = "service-frontdesk.customer-messaging-control.v1";
export const MESSAGING_CONTROL_CHANGED_EVENT = "service-frontdesk:messaging-control-changed";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, rows: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(MESSAGING_CONTROL_CHANGED_EVENT));
}

export class BrowserMessagingAutomationControlRepository {
  getTenant(tenantId: string): TenantAutomationControl {
    const rows = readArray<TenantAutomationControl>(TENANT_KEY);
    const row = rows.find((item) => item.tenantId === tenantId);
    return row
      ? clone(row)
      : { tenantId, agentEnabled: true, updatedAt: new Date(0).toISOString() };
  }

  setTenantAgentEnabled(tenantId: string, enabled: boolean, updatedBy?: string): TenantAutomationControl {
    const rows = readArray<TenantAutomationControl>(TENANT_KEY);
    const now = new Date().toISOString();
    const next: TenantAutomationControl = {
      tenantId,
      agentEnabled: enabled,
      updatedAt: now,
      ...(updatedBy ? { updatedBy } : {}),
    };
    const index = rows.findIndex((item) => item.tenantId === tenantId);
    if (index >= 0) rows[index] = next;
    else rows.push(next);
    writeArray(TENANT_KEY, rows);
    return clone(next);
  }

  getCustomer(tenantId: string, verticalId: string, customerId: string): CustomerMessagingControl {
    const rows = readArray<CustomerMessagingControl>(CUSTOMER_KEY);
    const row = rows.find(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.customerId === customerId,
    );
    return row
      ? clone(row)
      : {
          tenantId,
          verticalId,
          customerId,
          automationMode: "agent_allowed",
          whatsappConsent: "unknown",
          updatedAt: new Date(0).toISOString(),
        };
  }

  updateCustomer(
    tenantId: string,
    verticalId: string,
    customerId: string,
    patch: Partial<Omit<CustomerMessagingControl, "tenantId" | "verticalId" | "customerId">>,
  ): CustomerMessagingControl {
    const rows = readArray<CustomerMessagingControl>(CUSTOMER_KEY);
    const current = this.getCustomer(tenantId, verticalId, customerId);
    const next: CustomerMessagingControl = {
      ...current,
      ...clone(patch),
      tenantId,
      verticalId,
      customerId,
      updatedAt: new Date().toISOString(),
    };
    const index = rows.findIndex(
      (item) =>
        item.tenantId === tenantId &&
        item.verticalId === verticalId &&
        item.customerId === customerId,
    );
    if (index >= 0) rows[index] = next;
    else rows.push(next);
    writeArray(CUSTOMER_KEY, rows);
    return clone(next);
  }

  recordCustomerMessage(input: {
    tenantId: string;
    verticalId: string;
    customerId: string;
    at: string;
  }): CustomerMessagingControl {
    return this.updateCustomer(input.tenantId, input.verticalId, input.customerId, {
      lastCustomerMessageAt: input.at,
    });
  }

  optInWhatsApp(input: {
    tenantId: string;
    verticalId: string;
    customerId: string;
    at?: string;
    updatedBy?: string;
  }): CustomerMessagingControl {
    const at = input.at ?? new Date().toISOString();
    return this.updateCustomer(input.tenantId, input.verticalId, input.customerId, {
      whatsappConsent: "opted_in",
      optInAt: at,
      automationMode: "agent_allowed",
      ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
      reason: "WHATSAPP_OPT_IN",
    });
  }

  optOutWhatsApp(input: {
    tenantId: string;
    verticalId: string;
    customerId: string;
    at?: string;
    updatedBy?: string;
  }): CustomerMessagingControl {
    const at = input.at ?? new Date().toISOString();
    return this.updateCustomer(input.tenantId, input.verticalId, input.customerId, {
      whatsappConsent: "opted_out",
      optOutAt: at,
      automationMode: "human_only",
      ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
      reason: "WHATSAPP_OPT_OUT",
    });
  }

  setHumanOnly(input: {
    tenantId: string;
    verticalId: string;
    customerId: string;
    reason: string;
    updatedBy?: string;
  }): CustomerMessagingControl {
    return this.updateCustomer(input.tenantId, input.verticalId, input.customerId, {
      automationMode: "human_only",
      reason: input.reason,
      ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
    });
  }

  resumeAgent(input: {
    tenantId: string;
    verticalId: string;
    customerId: string;
    updatedBy?: string;
  }): CustomerMessagingControl {
    return this.updateCustomer(input.tenantId, input.verticalId, input.customerId, {
      automationMode: "agent_allowed",
      reason: "AGENT_RESUMED",
      ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
    });
  }
}

export const messagingAutomationControlRepository = new BrowserMessagingAutomationControlRepository();

const HUMAN_ONLY_PATTERNS = [
  /人工/i,
  /真人/i,
  /轉人工/i,
  /转人工/i,
  /停止\s*(ai|agent|機器人|机器人)/i,
  /不要\s*(ai|agent|機器人|机器人)/i,
];

const WHATSAPP_OPTOUT_PATTERNS = [
  /^\s*stop\s*$/i,
  /取消訂閱/i,
  /取消订阅/i,
  /停止消息/i,
  /停止訊息/i,
  /不要再發/i,
  /不要再发/i,
  /停止所有訊息/i,
  /停止所有消息/i,
];

export type CustomerControlCommand = "none" | "human_only" | "whatsapp_opt_out";

export function detectCustomerControlCommand(text: string): CustomerControlCommand {
  if (WHATSAPP_OPTOUT_PATTERNS.some((pattern) => pattern.test(text))) return "whatsapp_opt_out";
  if (HUMAN_ONLY_PATTERNS.some((pattern) => pattern.test(text))) return "human_only";
  return "none";
}
