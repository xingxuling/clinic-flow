import { useEffect, useMemo, useState } from "react";

import {
  MESSAGING_CONTROL_CHANGED_EVENT,
  messagingAutomationControlRepository,
  type WhatsAppConsentScope,
} from "@/messaging/automation-control";

export function useMessagingControls(tenantId: string, verticalId: string) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(MESSAGING_CONTROL_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MESSAGING_CONTROL_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const tenant = useMemo(
    () => messagingAutomationControlRepository.getTenant(tenantId),
    [tenantId, version],
  );

  return {
    tenant,
    getCustomer: (customerId: string) =>
      messagingAutomationControlRepository.getCustomer(tenantId, verticalId, customerId),
    setTenantAgentEnabled: (enabled: boolean, updatedBy?: string) =>
      messagingAutomationControlRepository.setTenantAgentEnabled(tenantId, enabled, updatedBy),
    setHumanOnly: (customerId: string, reason: string, updatedBy?: string) =>
      messagingAutomationControlRepository.setHumanOnly({
        tenantId,
        verticalId,
        customerId,
        reason,
        ...(updatedBy ? { updatedBy } : {}),
      }),
    resumeAgent: (customerId: string, updatedBy?: string) =>
      messagingAutomationControlRepository.resumeAgent({
        tenantId,
        verticalId,
        customerId,
        ...(updatedBy ? { updatedBy } : {}),
      }),
    recordWhatsAppOptIn: (
      customerId: string,
      scopes: WhatsAppConsentScope[],
      updatedBy?: string,
    ) =>
      messagingAutomationControlRepository.optInWhatsApp({
        tenantId,
        verticalId,
        customerId,
        scopes,
        ...(updatedBy ? { updatedBy } : {}),
      }),
    recordWhatsAppOptOut: (customerId: string, updatedBy?: string) =>
      messagingAutomationControlRepository.optOutWhatsApp({
        tenantId,
        verticalId,
        customerId,
        ...(updatedBy ? { updatedBy } : {}),
      }),
  };
}
