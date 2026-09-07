import type { ChannelKind } from "@/types/domain";
import type {
  ServiceConversation,
  ServiceConversationMessage,
  ServiceConversationState,
  ServiceMessageFrom,
} from "@/conversations/types";

const STORAGE_KEY = "service-frontdesk.conversations.v1";
export const SERVICE_CONVERSATIONS_CHANGED_EVENT = "service-frontdesk:conversations-changed";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface AppendServiceMessageInput {
  tenantId: string;
  verticalId: string;
  customerId: string;
  channel: ChannelKind;
  from: ServiceMessageFrom;
  authorName: string;
  text: string;
  at: string;
  providerMessageId?: string;
  subject?: string;
  state?: ServiceConversationState;
  unread?: boolean;
}

export class BrowserServiceConversationRepository {
  private readAll(): ServiceConversation[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((row): row is ServiceConversation => {
        if (!row || typeof row !== "object") return false;
        const value = row as Partial<ServiceConversation>;
        return Boolean(
          typeof value.id === "string" &&
            typeof value.tenantId === "string" &&
            typeof value.verticalId === "string" &&
            typeof value.customerId === "string" &&
            typeof value.channel === "string" &&
            Array.isArray(value.messages),
        );
      });
    } catch {
      return [];
    }
  }

  private writeAll(rows: ServiceConversation[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(SERVICE_CONVERSATIONS_CHANGED_EVENT));
  }

  list(tenantId: string, verticalId: string): ServiceConversation[] {
    return clone(
      this.readAll()
        .filter((row) => row.tenantId === tenantId && row.verticalId === verticalId)
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    );
  }

  get(tenantId: string, conversationId: string): ServiceConversation | null {
    const row = this.readAll().find((item) => item.tenantId === tenantId && item.id === conversationId);
    return row ? clone(row) : null;
  }

  findByProviderMessageId(
    tenantId: string,
    verticalId: string,
    providerMessageId: string,
  ): ServiceConversation | null {
    if (!providerMessageId.trim()) return null;
    const row = this.readAll().find(
      (conversation) =>
        conversation.tenantId === tenantId &&
        conversation.verticalId === verticalId &&
        conversation.messages.some((message) => message.providerMessageId === providerMessageId),
    );
    return row ? clone(row) : null;
  }

  appendMessage(input: AppendServiceMessageInput): ServiceConversation {
    if (!input.tenantId.trim()) throw new Error("CONVERSATION_TENANT_REQUIRED");
    if (!input.verticalId.trim()) throw new Error("CONVERSATION_VERTICAL_REQUIRED");
    if (!input.customerId.trim()) throw new Error("CONVERSATION_CUSTOMER_REQUIRED");
    if (!input.text.trim()) throw new Error("CONVERSATION_MESSAGE_REQUIRED");
    if (Number.isNaN(new Date(input.at).getTime())) throw new Error("CONVERSATION_MESSAGE_TIME_INVALID");

    const rows = this.readAll();
    if (input.providerMessageId) {
      const existing = rows.find(
        (conversation) =>
          conversation.tenantId === input.tenantId &&
          conversation.verticalId === input.verticalId &&
          conversation.messages.some((message) => message.providerMessageId === input.providerMessageId),
      );
      if (existing) return clone(existing);
    }

    const index = rows.findIndex(
      (row) =>
        row.tenantId === input.tenantId &&
        row.verticalId === input.verticalId &&
        row.customerId === input.customerId &&
        row.channel === input.channel &&
        row.state !== "closed",
    );
    const message: ServiceConversationMessage = {
      id: makeId("msg"),
      from: input.from,
      authorName: input.authorName,
      text: input.text.trim(),
      at: input.at,
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    };

    if (index < 0) {
      const conversation: ServiceConversation = {
        id: makeId("conv"),
        tenantId: input.tenantId,
        verticalId: input.verticalId,
        customerId: input.customerId,
        channel: input.channel,
        subject: input.subject?.trim() || "服務查詢",
        state: input.state ?? (input.from === "customer" ? "agent_handling" : "human"),
        unread: input.unread ?? input.from === "customer",
        lastAt: input.at,
        messages: [message],
        source: "messaging_adapter",
      };
      rows.push(conversation);
      this.writeAll(rows);
      return clone(conversation);
    }

    const current = rows[index]!;
    rows[index] = {
      ...current,
      messages: [...current.messages, message],
      lastAt: input.at,
      state: input.state ?? current.state,
      unread: input.unread ?? (input.from === "customer" ? true : current.unread),
    };
    this.writeAll(rows);
    return clone(rows[index]!);
  }

  update(
    tenantId: string,
    conversationId: string,
    patch: Partial<ServiceConversation>,
  ): ServiceConversation | null {
    const rows = this.readAll();
    const index = rows.findIndex((row) => row.tenantId === tenantId && row.id === conversationId);
    if (index < 0) return null;
    const current = rows[index]!;
    rows[index] = {
      ...current,
      ...clone(patch),
      id: current.id,
      tenantId: current.tenantId,
      verticalId: current.verticalId,
      customerId: current.customerId,
    };
    this.writeAll(rows);
    return clone(rows[index]!);
  }
}

export const serviceConversationRepository = new BrowserServiceConversationRepository();
