import type {
  MessagingAdapter,
  WhatsAppTemplateCategory,
  WhatsAppTemplateRef,
} from "@/integrations/messaging-adapter";
import type { CustomerMessagingControl, TenantAutomationControl } from "@/messaging/automation-control";
import { whatsAppTemplateRegistry } from "@/messaging/whatsapp-template-registry";

export type WhatsAppSendActor = "agent" | "human";
export type WhatsAppSendInitiation = "response" | "business_initiated";
export type WhatsAppMessagePurpose = "utility" | "marketing";

export type WhatsAppPolicyBlockCode =
  | "WHATSAPP_BUSINESS_PLATFORM_REQUIRED"
  | "TENANT_AGENT_PAUSED"
  | "CUSTOMER_REQUESTED_HUMAN"
  | "WHATSAPP_OPTED_OUT"
  | "WHATSAPP_OPT_IN_REQUIRED"
  | "WHATSAPP_CONSENT_SCOPE_REQUIRED"
  | "WHATSAPP_TEMPLATE_REQUIRED"
  | "WHATSAPP_TEMPLATE_CATEGORY_MISMATCH"
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

function isPurposeCategory(
  category: WhatsAppTemplateCategory,
  purpose: WhatsAppMessagePurpose | undefined,
): boolean {
  if (!purpose) return true;
  return category === purpose;
}

/**
 * Deterministic WhatsApp Business policy gate.
 *
 * The 24-hour service window and user consent are independent gates:
 * - the window decides whether a template is required;
 * - consent decides whether a business-initiated message category may be sent.
 *
 * This does not replace Meta review; it encodes minimum local fail-closed rules.
 */
export function evaluateWhatsAppPolicy(input: {
  tenantId: string;
  adapter: MessagingAdapter;
  production: boolean;
  actor: WhatsAppSendActor;
  initiation: WhatsAppSendInitiation;
  tenantControl: TenantAutomationControl;
  customerControl: CustomerMessagingControl;
  purpose?: WhatsAppMessagePurpose;
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

    if (
      input.purpose &&
      !input.customerControl.whatsappConsentScopes.includes(input.purpose)
    ) {
      return {
        allowed: false,
        within24h,
        requiresTemplate,
        blockCode: "WHATSAPP_CONSENT_SCOPE_REQUIRED",
        reason: `Customer consent does not include ${input.purpose} business-initiated messages.`,
      };
    }
  }

  if (!requiresTemplate) {
    return {
      allowed: true,
      within24h: true,
      requiresTemplate: false,
      blockCode: null,
      reason: "Inside the 24-hour customer service window and consent checks passed.",
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

  if (!isPurposeCategory(input.template.category, input.purpose)) {
    return {
      allowed: false,
      within24h: false,
      requiresTemplate: true,
      blockCode: "WHATSAPP_TEMPLATE_CATEGORY_MISMATCH",
      reason: "The configured template category does not match the message purpose.",
    };
  }

  if (!input.customerControl.whatsappConsentScopes.includes(input.template.category)) {
    return {
      allowed: false,
      within24h: false,
      requiresTemplate: true,
      blockCode: "WHATSAPP_CONSENT_SCOPE_REQUIRED",
      reason: `Customer consent does not include ${input.template.category} messages.`,
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
