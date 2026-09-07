import type { Clinic } from "@/types/domain";
import type { ServiceFaqEntry } from "@/frontdesk/faq-engine";
import { autoRepairVerticalPack } from "@/verticals/auto-repair";
import { beautyVerticalPack } from "@/verticals/beauty";
import { dentalVerticalPack } from "@/verticals/dental";
import { homeServiceVerticalPack } from "@/verticals/home-service";
import { petCareVerticalPack } from "@/verticals/pet-care";
import { regulatedHealthVerticalPack } from "@/verticals/regulated-health";
import type { ServiceVerticalPack } from "@/verticals/types";

export const verticalPacks = [
  dentalVerticalPack,
  petCareVerticalPack,
  homeServiceVerticalPack,
  beautyVerticalPack,
  autoRepairVerticalPack,
  regulatedHealthVerticalPack,
] as const;

const registry = new Map<string, ServiceVerticalPack>(
  verticalPacks.map((pack) => [pack.id, pack]),
);

export function getVerticalPack(id: string): ServiceVerticalPack | null {
  return registry.get(id) ?? null;
}

/**
 * 通过稳定 service id 找出所属行业包。
 * 如果未来两个 Vertical Pack 误用了同一个 service id，则 fail closed 返回 null，
 * 不允许 Repository 随机把 Booking 归到某个行业。
 */
export function resolveVerticalIdForService(serviceId: string): string | null {
  const matches = verticalPacks.filter((pack) =>
    pack.services.some((service) => service.id === serviceId),
  );
  return matches.length === 1 ? matches[0]!.id : null;
}

export function resolveVerticalPackForClinic(clinic: Pick<Clinic, "kind">): ServiceVerticalPack {
  if (clinic.kind === "dental") return dentalVerticalPack;
  return regulatedHealthVerticalPack;
}

export function materializeFaqEntries(
  pack: ServiceVerticalPack,
  tenantId: string,
): ServiceFaqEntry[] {
  return pack.faqTemplates.map((template) => ({
    id: template.id,
    clinicId: tenantId,
    category: template.category,
    question: template.question,
    answer: template.answer,
    keywords: [...template.keywords],
    channels: [...template.channels],
    enabled: template.enabled,
    administrativeOnly: true,
  }));
}

export interface VerticalValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * 行业包是插件契约，不允许靠修改 core 才能“成立”。
 * 这里只做结构级 fail-closed 校验，不替代行业真实客户验证。
 */
export function validateVerticalPack(pack: ServiceVerticalPack): VerticalValidationResult {
  const errors: string[] = [];
  if (!pack.id.trim()) errors.push("VERTICAL_ID_REQUIRED");
  if (!pack.displayName.trim()) errors.push("DISPLAY_NAME_REQUIRED");
  if (!pack.labels.customer.trim()) errors.push("CUSTOMER_LABEL_REQUIRED");
  if (!pack.labels.booking.trim()) errors.push("BOOKING_LABEL_REQUIRED");
  if (pack.defaultHumanApprovalLeadHours < 0) errors.push("LEAD_HOURS_INVALID");

  const ids = new Set<string>();
  for (const service of pack.services) {
    if (ids.has(service.id)) errors.push(`DUPLICATE_SERVICE:${service.id}`);
    ids.add(service.id);
  }

  const faqIds = new Set<string>();
  for (const faq of pack.faqTemplates) {
    if (faqIds.has(faq.id)) errors.push(`DUPLICATE_FAQ:${faq.id}`);
    faqIds.add(faq.id);
    if (!faq.administrativeOnly) errors.push(`FAQ_NOT_ADMIN_ONLY:${faq.id}`);
  }

  return { ok: errors.length === 0, errors };
}
