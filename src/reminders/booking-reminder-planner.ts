import type { ServiceBooking } from "@/bookings/types";
import type { ServiceCustomer } from "@/customers/types";
import { buildBookingReminder, type BookingReminderView } from "@/frontdesk/booking-reminder";
import { serviceWorkItemRepository } from "@/work-items/repository";
import type { ServiceWorkItem } from "@/work-items/types";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface BookingReminderCandidate {
  sourceRef: string;
  bookingId: string;
  customerId: string;
  leadHours: number;
  dueAt: string;
  overdue: boolean;
  reminder: BookingReminderView;
  serviceName: string;
  resourceName?: string;
}

function reminderSourceRef(bookingId: string, leadHours: number): string {
  return `booking-reminder:${bookingId}:${leadHours}h`;
}

export function planBookingReminderCandidates(input: {
  vertical: ServiceVerticalPack;
  timezone: string;
  reminderLeadHours: readonly number[];
  bookings: readonly ServiceBooking[];
  customers: readonly ServiceCustomer[];
  resourceName?: (resourceId: string) => string | undefined;
  now?: Date;
}): BookingReminderCandidate[] {
  const now = input.now ?? new Date();
  const candidates: BookingReminderCandidate[] = [];
  const leads = [...new Set(input.reminderLeadHours.filter((hours) => hours > 0))].sort((a, b) => b - a);

  for (const booking of input.bookings) {
    if (booking.verticalId !== input.vertical.id) continue;
    if (booking.status !== "pending" && booking.status !== "confirmed") continue;
    const start = new Date(booking.startAt);
    if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) continue;

    const customer = input.customers.find(
      (row) => row.id === booking.customerId && row.verticalId === input.vertical.id,
    );
    if (!customer) continue;

    const serviceName =
      input.vertical.services.find((service) => service.id === booking.serviceId)?.name ?? "服務";
    const resourceName = input.resourceName?.(booking.resourceId);

    for (const leadHours of leads) {
      const due = new Date(start.getTime() - leadHours * 60 * 60 * 1000);
      const reminder = buildBookingReminder({
        vertical: input.vertical,
        timezone: input.timezone,
        customerName: customer.displayName,
        bookingId: booking.id,
        startAt: booking.startAt,
        serviceName,
        ...(resourceName ? { resourceName } : {}),
      });
      candidates.push({
        sourceRef: reminderSourceRef(booking.id, leadHours),
        bookingId: booking.id,
        customerId: customer.id,
        leadHours,
        dueAt: due.toISOString(),
        overdue: due.getTime() <= now.getTime(),
        reminder,
        serviceName,
        ...(resourceName ? { resourceName } : {}),
      });
    }
  }

  return candidates.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function createBookingReminderWorkItem(input: {
  tenantId: string;
  vertical: ServiceVerticalPack;
  candidate: BookingReminderCandidate;
}): ServiceWorkItem {
  const existing = serviceWorkItemRepository.findBySource(
    input.tenantId,
    input.vertical.id,
    input.candidate.sourceRef,
  );
  if (existing) return existing;

  return serviceWorkItemRepository.add({
    tenantId: input.tenantId,
    verticalId: input.vertical.id,
    kind: "booking_reminder",
    customerId: input.candidate.customerId,
    title: `${input.vertical.labels.booking}提醒 · ${input.candidate.serviceName}`,
    intent: `在服務前 ${input.candidate.leadHours} 小時向${input.vertical.labels.customer}發送已核准的${input.vertical.labels.booking}提醒。`,
    basis: [
      `${input.vertical.labels.booking}：${input.candidate.bookingId}`,
      `提醒提前量：${input.candidate.leadHours} 小時`,
      `預計發送時間：${input.candidate.dueAt}`,
      "WhatsApp 預約／服務提醒預設按 utility 類別處理。",
    ],
    effects: [
      "建立 1 則待批准提醒訊息",
      "訊息包含確認／改期／取消按鈕",
      "批准後仍須通過 WhatsApp opt-in / 24h / template policy gate",
      "Messaging Adapter 真實成功前不標記已送出",
    ],
    risk: "low",
    proposedMessage: input.candidate.reminder.text,
    proposedReplyOptions: input.candidate.reminder.replyOptions.map((option) => ({ ...option })),
    messagePurpose: "utility",
    sourceRef: input.candidate.sourceRef,
  });
}
