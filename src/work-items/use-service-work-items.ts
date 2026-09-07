import { useEffect, useState } from "react";

import {
  SERVICE_WORK_ITEMS_CHANGED_EVENT,
  serviceWorkItemRepository,
} from "@/work-items/repository";
import type { ServiceWorkItem } from "@/work-items/types";

export function useServiceWorkItems(tenantId: string, verticalId: string): ServiceWorkItem[] {
  const [items, setItems] = useState<ServiceWorkItem[]>([]);

  useEffect(() => {
    const refresh = () => setItems(serviceWorkItemRepository.list(tenantId, verticalId));
    refresh();
    window.addEventListener(SERVICE_WORK_ITEMS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SERVICE_WORK_ITEMS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [tenantId, verticalId]);

  return items;
}
