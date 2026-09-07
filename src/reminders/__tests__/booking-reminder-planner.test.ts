import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceBooking } from "@/bookings/types";
import type { ServiceCustomer } from "@/customers/types";
import {
  createBookingReminderWorkItem,
  planBookingReminderCandidates,
} from "@/reminders/booking-reminder-planner";
import { getVerticalPack } from "@/verticals/registry";
import { serviceWorkItemRepository } from "@/work-items/repository";

function installBrowserStorage() {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal("window", {
    localStorage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "CustomEvent",
    class CustomEventMock {
      constructor(public type: string) {}
    },
  );
}

const customer: ServiceCustomer = {
  id: "customer_pet_booking_01",
  tenantId: "tenant_reminder_demo",
  verticalId: "pet-care",
  displayName: "陈先生",
  phone: "91234567",
  preferredChannel: "whatsapp",
  language: "zh-HK",
  tags: [],
  notesAdmin: "",
  subjects: [],
  source: "manual",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const booking: ServiceBooking = {
  id: "booking_pet_001",
  tenantId: customer.tenantId,
  verticalId: "pet-care",
  customerId: customer.id,
  resourceId: "staff_groomer",
  serviceId: "pet_full_groom",
  startAt: "2026-09-10T10:00:00+08:00",
  endAt: "2026-09-10T12:00:00+08:00",
  status: "confirmed",
  venue: "门店",
  note: "",
  source: "manual",
  createdAt: "2026-09-07T10:00:00+08:00",
  updatedAt: "2026-09-07T10:00:00+08:00",
};

beforeEach(() => installBrowserStorage());
afterEach(() => vi.unstubAllGlobals());

describe("Booking Reminder Planner", () => {
  it("同一 Booking 按不同 lead hour 产生不同提醒候选，并保留三个交互按钮", () => {
    const vertical = getVerticalPack("pet-care")!;
    const candidates = planBookingReminderCandidates({
      vertical,
      timezone: "Asia/Hong_Kong",
      reminderLeadHours: [48, 24, 24],
      bookings: [booking],
      customers: [customer],
      resourceName: () => "阿明",
      now: new Date("2026-09-07T09:00:00+08:00"),
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.sourceRef)).toEqual([
      "booking-reminder:booking_pet_001:48h",
      "booking-reminder:booking_pet_001:24h",
    ]);
    expect(candidates[0]?.reminder.replyOptions.map((option) => option.label)).toEqual([
      "確認",
      "改期",
      "取消",
    ]);
    expect(candidates[0]?.reminder.replyOptions.map((option) => option.payload)).toEqual([
      "booking:confirm:booking_pet_001",
      "booking:reschedule:booking_pet_001",
      "booking:cancel:booking_pet_001",
    ]);
  });

  it("取消、已到场、失约、过去的 Booking 不产生未来提醒候选", () => {
    const vertical = getVerticalPack("pet-care")!;
    const variants: ServiceBooking[] = [
      { ...booking, id: "cancelled", status: "cancelled" },
      { ...booking, id: "arrived", status: "arrived" },
      { ...booking, id: "no_show", status: "no_show" },
      { ...booking, id: "past", startAt: "2026-09-01T10:00:00+08:00", endAt: "2026-09-01T12:00:00+08:00" },
    ];
    const candidates = planBookingReminderCandidates({
      vertical,
      timezone: "Asia/Hong_Kong",
      reminderLeadHours: [24],
      bookings: variants,
      customers: [customer],
      now: new Date("2026-09-07T09:00:00+08:00"),
    });
    expect(candidates).toEqual([]);
  });

  it("Work Item sourceRef 幂等：同一个提醒候选只建立一份工作项", () => {
    const vertical = getVerticalPack("pet-care")!;
    const [candidate] = planBookingReminderCandidates({
      vertical,
      timezone: "Asia/Hong_Kong",
      reminderLeadHours: [24],
      bookings: [booking],
      customers: [customer],
      now: new Date("2026-09-07T09:00:00+08:00"),
    });
    expect(candidate).toBeTruthy();

    const first = createBookingReminderWorkItem({
      tenantId: customer.tenantId,
      vertical,
      candidate: candidate!,
    });
    const second = createBookingReminderWorkItem({
      tenantId: customer.tenantId,
      vertical,
      candidate: candidate!,
    });

    expect(second.id).toBe(first.id);
    expect(first.kind).toBe("booking_reminder");
    expect(first.proposedReplyOptions).toHaveLength(3);
    expect(serviceWorkItemRepository.list(customer.tenantId, vertical.id)).toHaveLength(1);
  });
});
