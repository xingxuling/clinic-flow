import type {
  MessagingAdapter,
  WhatsAppTemplateCategory,
  WhatsAppTemplateRef,
} from "@/integrations/messaging-adapter";
import type { CustomerMessagingControl, TenantAutomationControl } from "@/messaging/automation-control";
import { whatsAppTemplateRegistry } from "@/messaging/whatsapp-template-registry";

export type WhatsAppSendActor = "agent" | "human";
export type WhatsAppSendInitiation = "response" | "business_initiated";

export type WhatsAppPolicyBlockCode =
  | "WHATSAPP_BUSINESS_PLATFORM_REQUIRED"
  | "TENANT_AGENT_PAUSED"
  | "CUSTOMER_REQUESTED_HUMAN"
  | "WHATSAPP_OPTED_OUT"
  | "WHATSAPP_OPT_IN_REQUIRED"
  | "WHATSAPP_CONSENT_SCOPE_REQUIRED"
  | "WHATSAPP_24H_WINDOW_CLOSED"
  | "WHATSAPP_TEMPLATE_REQUIRED"
  | "WHATSAPP_TEMPLATE_NOT_APPROVED";

export interface WhatsAppPolicyDecision {
  allowed: boolean;
  within24h: boolean;
  requiresTemplate: boolean;
  blockCode: WhatsAppPolicyBlockCode | null;
  reason: string;
}

function within24Hours(lastCustomerMessageAt: string | undefined, now: Date): boolean {
  if (!lastCustomerMessageAt) return false;
  const at = new Date(lastCustomerMessageAt).getTime();
  if (!Number.isFinite(at)) return false;
  const delta = now.getTime() - at;
  return delta >= 0 && delta <= 24 * 60 * 60 * 1000;
}

function scopeForCategory(category: WhatsAppTemplateCategory): WhatsAppTemplateCategory {
  return category;
}

/**
 * Deterministic WhatsApp Business policy gate.
 *
 * This does not replace Meta policy review. It encodes the minimum product
 * boundaries we can enforce locally so no feature can bypass them casually.
 */
export function evaluateWhatsAppPolicy(input: {
  tenantId: string;
  adapter: MessagingAdapter;
  production: boolean;
  actor: WhatsAppSendActor;
  initiation: WhatsAppSendInitiation;
  tenantControl: TenantAutomationControl;
  customerControl: CustomerMessagingControl;
  template?: WhatsAppTemplateRef;
  now?: Date;
}): WhatsAppPolicyDecision {
  const now = input.now ?? new Date();
  const within24h = within24Hours(input.customerControl.lastCustomerMessageAt, now);
  const requiresTemplate = !within24h;

  if (
    input.production &&
    (input.adapter.providerKind !== "whatsapp_business_platform" || !input.adapter.productionEligible)
  ) {
    return {
      allowed: false,
      within24h,
      requiresTemplate,
      blockCode: "WHATSAPP_BUSINESS_PLATFORM_REQUIRED",
      reason: "Production WhatsApp must use the official WhatsApp Business Platform / approved BSP path.",
    };
  }

  if (input.actor === "agent" && !input.tenantControl.agentEnabled) {
    return {
      allowed: false,
      within24h,
      requiresTemplate,
      blockCode: "TENANT_AGENT_PAUSED",
      reason: "The merchant has globally paused Agent automation.",
    };
  }

  if (input.actor === "agent" && input.customerControl.automationMode === "human_only") {
    return {
      allowed: false,
      within24h,
      requiresTemplate,
      blockCode: "CUSTOMER_REQUESTED_HUMAN",
      reason: "The customer requested human-only handling.",
    };
  }

  if (input.customerControl.whatsappConsent === "opted_out") {
    if (!(input.actor === "human" && input.initiation === "response" && within24h)) {
      return {
        allowed: false,
        within24h,
        requiresTemplate,
        blockCode: "WHATSAPP_OPTED_OUT",
        reason: "The customer opted out of WhatsApp communications.",
      };
    }
  }

  if (input.initiation === "business_initiated") {
    if (input.customerControl.whatsappConsent !== "opted_in") {
      return {
        allowed: false,
        within24h,
        requiresTemplate,
        blockCode: "WHATSAPP_OPT_IN_REQUIRED",
        reason: "Business-initiated WhatsApp messages require recorded opt-in.",
      };
    }
  }

  if (!requiresTemplate) {
    return {
      allowed: true,
      within24h: true,
      requiresTemplate: false,
      blockCode: null,
      reason: "Inside the 24-hour customer service window.",
    };
  }

  if (!input.template) {
    return {
      allowed: false,
      within24h: false,
      requiresTemplate: true,
      blockCode: "WHATSAPP_TEMPLATE_REQUIRED",
      reason: "Outside the 24-hour window, an approved WhatsApp message template is required.",
    };
  }

  const requiredScope = scopeForCategory(input.template.category);
  if (!input.customerControl.whatsappConsentScopes.includes(requiredScope)) {
    return {
      allowed: false,
      within24h: false,
      requiresTemplate: true,
      blockCode: "WHATSAPP_CONSENT_SCOPE_REQUIRED",
      reason: `Customer consent does not include ${requiredScope} messages.`,
    };
  }

  if (!whatsAppTemplateRegistry.isApproved(input.tenantId, input.template)) {
    return {
      allowed: false,
      within24h: false,
      requiresTemplate: true,
      blockCode: "WHATSAPP_TEMPLATE_NOT_APPROVED",
      reason: "The configured WhatsApp template is not recorded as approved for this tenant.",
    };
  }

  return {
    allowed: true,
    within24h: false,
    requiresTemplate: true,
    blockCode: null,
    reason: "Approved template and matching consent scope are available.",
  };
}
