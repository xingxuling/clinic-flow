import { describe, expect, it } from "vitest";

import { MockWhatsAppAdapter } from "@/integrations/messaging-adapter";
import type { NotificationIntent } from "@/scheduling/types";
import { dispatchSchedulingNotification } from "@/scheduling/notification-dispatch";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const intent: NotificationIntent = {
  notificationId: "notification_01",
  tenantId: "tenant_demo",
  verticalId: "home-service",
  jobId: "job_01",
  audience: "customer",
  channel: "whatsapp",
  purpose: "utility",
  text: "你的服务已确认。",
  status: "queued",
  policyRequired: true,
  createdAt: NOW.toISOString(),
};

const tenantControl = {
  tenantId: "tenant_demo",
  agentEnabled: true,
  updatedAt: NOW.toISOString(),
};

function recipientControl(overrides: Partial<Parameters<typeof makeRecipientControl>[0]> = {}) {
  return makeRecipientControl(overrides);
}

function makeRecipientControl(
  overrides: {
    whatsappConsent?: "unknown" | "opted_in" | "opted_out";
    whatsappConsentScopes?: ("utility" | "marketing" | "authentication")[];
    lastCustomerMessageAt?: string;
  } = {},
) {
  return {
    tenantId: "tenant_demo",
    verticalId: "home-service",
    customerId: "customer_01",
    automationMode: "agent_allowed" as const,
    whatsappConsent: overrides.whatsappConsent ?? ("unknown" as const),
    whatsappConsentScopes: overrides.whatsappConsentScopes ?? [],
    ...(overrides.lastCustomerMessageAt
      ? { lastCustomerMessageAt: overrides.lastCustomerMessageAt }
      : {}),
    updatedAt: NOW.toISOString(),
  };
}

describe("scheduling notification channel boundary", () => {
  it("blocks WhatsApp before adapter send when opt-in is absent", async () => {
    const adapter = new MockWhatsAppAdapter();
    const result = await dispatchSchedulingNotification({
      intent,
      adapter,
      recipientId: "customer_01",
      recipientPhone: "+85200000000",
      tenantControl,
      recipientControl: recipientControl(),
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("WHATSAPP_OPT_IN_REQUIRED");
    expect(adapter.snapshot()).toHaveLength(0);
  });

  it("uses the existing 24-hour Policy Gate and then sends only a real recipient phone", async () => {
    const adapter = new MockWhatsAppAdapter();
    const result = await dispatchSchedulingNotification({
      intent,
      adapter,
      recipientId: "customer_01",
      recipientPhone: "+85200000000",
      tenantControl,
      recipientControl: recipientControl({
        whatsappConsent: "opted_in",
        whatsappConsentScopes: ["utility"],
        lastCustomerMessageAt: "2026-09-10T08:30:00.000Z",
      }),
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.policy?.allowed).toBe(true);
    expect(adapter.snapshot()[0]).toMatchObject({
      patientId: "customer_01",
      recipientPhone: "+85200000000",
    });
  });

  it("does not turn an internal participant ID into a WhatsApp recipient", async () => {
    const result = await dispatchSchedulingNotification({
      intent,
      adapter: new MockWhatsAppAdapter(),
      recipientId: "customer_01",
      tenantControl,
      recipientControl: recipientControl({
        whatsappConsent: "opted_in",
        whatsappConsentScopes: ["utility"],
      }),
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("WHATSAPP_RECIPIENT_PHONE_REQUIRED");
  });
});
