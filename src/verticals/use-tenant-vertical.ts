import { useEffect, useState } from "react";

import type { Clinic } from "@/types/domain";
import { resolveVerticalPackForClinic } from "@/verticals/registry";
import {
  resolveVerticalPackForTenant,
  TENANT_VERTICAL_CHANGED_EVENT,
  type TenantVerticalChangedDetail,
} from "@/verticals/tenant-selection";
import type { ServiceVerticalPack } from "@/verticals/types";

export function useTenantVertical(clinic: Pick<Clinic, "id" | "kind">): ServiceVerticalPack {
  const [vertical, setVertical] = useState<ServiceVerticalPack>(() => resolveVerticalPackForClinic(clinic));

  useEffect(() => {
    const refresh = () => setVertical(resolveVerticalPackForTenant(clinic));
    refresh();

    const onVerticalChanged = (event: Event) => {
      const detail = (event as CustomEvent<TenantVerticalChangedDetail>).detail;
      if (detail?.tenantId === clinic.id) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes("tenant-verticals")) refresh();
    };

    window.addEventListener(TENANT_VERTICAL_CHANGED_EVENT, onVerticalChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TENANT_VERTICAL_CHANGED_EVENT, onVerticalChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [clinic.id, clinic.kind]);

  return vertical;
}
