import { planServiceFollowUps } from "@/core/follow-up";
import type { CustomerFollowUpSnapshot, ServiceCustomer } from "@/customers/types";
import type { ServiceVerticalPack } from "@/verticals/types";

export function enrichImportedFollowUp(input: {
  vertical: ServiceVerticalPack;
  customer: ServiceCustomer;
  followUp?: CustomerFollowUpSnapshot;
  now?: Date;
}): CustomerFollowUpSnapshot | undefined {
  const snapshot = input.followUp;
  if (!snapshot?.lastService || !snapshot.lastServiceDate) return snapshot;

  const service = input.vertical.services.find(
    (item) => item.name.trim().toLocaleLowerCase() === snapshot.lastService?.trim().toLocaleLowerCase(),
  );
  if (!service) return snapshot;

  const subjectId = input.customer.subjects[0]?.id;
  const [candidate] = planServiceFollowUps({
    vertical: input.vertical,
    records: [
      {
        tenantId: input.customer.tenantId,
        customerId: input.customer.id,
        subjectId,
        serviceId: service.id,
        completedAt: snapshot.lastServiceDate,
      },
    ],
    now: input.now,
  });

  if (!candidate) return snapshot;
  return {
    ...snapshot,
    ruleId: candidate.ruleId,
    ruleLabel: candidate.ruleLabel,
    dueAt: candidate.dueAt,
    customerMessage: candidate.customerMessage,
    followUpHint: candidate.ruleLabel,
  };
}
