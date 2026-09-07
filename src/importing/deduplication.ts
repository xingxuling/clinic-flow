import { normalizePhone } from "@/customers/repository";
import type { ServiceCustomer } from "@/customers/types";
import type { DuplicateCandidate } from "@/importing/types";

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s·•._-]+/g, "");
}

export function findDuplicateCustomers(
  existing: readonly ServiceCustomer[],
  input: { displayName: string; phone: string },
): DuplicateCandidate[] {
  const phone = normalizePhone(input.phone);
  const name = normalizeName(input.displayName);

  return existing
    .map((customer): DuplicateCandidate | null => {
      const samePhone = phone.length >= 6 && normalizePhone(customer.phone) === phone;
      const sameName = name.length >= 2 && normalizeName(customer.displayName) === name;
      if (!samePhone && !sameName) return null;
      const score = samePhone && sameName ? 1 : samePhone ? 0.98 : 0.72;
      return {
        customerId: customer.id,
        displayName: customer.displayName,
        phone: customer.phone,
        score,
        reason: samePhone && sameName ? "phone_and_name" : samePhone ? "phone_exact" : "name_exact",
      };
    })
    .filter((value): value is DuplicateCandidate => Boolean(value))
    .sort((a, b) => b.score - a.score);
}

export function blocksAutomaticSave(duplicates: readonly DuplicateCandidate[]): boolean {
  return duplicates.some((item) => item.score >= 0.9);
}
