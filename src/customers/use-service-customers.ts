import { useEffect, useMemo, useState } from "react";

import { serviceCustomerRepository } from "@/customers/repository";
import { patientToServiceCustomer, type ServiceCustomer } from "@/customers/types";
import type { Clinic, Patient } from "@/types/domain";
import type { ServiceVerticalPack } from "@/verticals/types";

export function useServiceCustomers(input: {
  clinic: Pick<Clinic, "id">;
  vertical: ServiceVerticalPack;
  legacyPatients?: readonly Patient[];
}) {
  const [imported, setImported] = useState<ServiceCustomer[]>([]);

  useEffect(() => {
    const refresh = () => {
      setImported(serviceCustomerRepository.list(input.clinic.id, input.vertical.id));
    };
    refresh();
    window.addEventListener("service-frontdesk:customers-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("service-frontdesk:customers-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [input.clinic.id, input.vertical.id]);

  const legacy = useMemo(
    () =>
      input.vertical.id === "dental"
        ? (input.legacyPatients ?? []).map(patientToServiceCustomer)
        : [],
    [input.legacyPatients, input.vertical.id],
  );

  const customers = useMemo(() => {
    const rows = new Map<string, ServiceCustomer>();
    for (const customer of legacy) rows.set(customer.id, customer);
    for (const customer of imported) rows.set(customer.id, customer);
    return [...rows.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-HK"));
  }, [legacy, imported]);

  const customerName = (customerId: string) =>
    customers.find((customer) => customer.id === customerId)?.displayName ?? `客戶 ${customerId}`;

  return { customers, customerName };
}
