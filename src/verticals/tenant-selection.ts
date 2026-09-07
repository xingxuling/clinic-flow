import type { Clinic } from "@/types/domain";
import { getVerticalPack, resolveVerticalPackForClinic } from "@/verticals/registry";
import type { ServiceVerticalPack } from "@/verticals/types";

const STORAGE_KEY = "service-frontdesk.tenant-verticals.v1";
export const TENANT_VERTICAL_CHANGED_EVENT = "service-frontdesk:tenant-vertical-changed";

function read(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

export function selectedVerticalId(tenantId: string): string | null {
  return read()[tenantId] ?? null;
}

export function setTenantVertical(tenantId: string, verticalId: string) {
  if (typeof window === "undefined") return;
  if (!getVerticalPack(verticalId)) throw new Error(`UNKNOWN_VERTICAL:${verticalId}`);
  const next = { ...read(), [tenantId]: verticalId };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent(TENANT_VERTICAL_CHANGED_EVENT, { detail: { tenantId, verticalId } }),
  );
}

export function resolveVerticalPackForTenant(clinic: Pick<Clinic, "id" | "kind">): ServiceVerticalPack {
  const selected = selectedVerticalId(clinic.id);
  if (selected) {
    const pack = getVerticalPack(selected);
    if (pack) return pack;
  }
  return resolveVerticalPackForClinic(clinic);
}
