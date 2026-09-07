import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserServiceBookingRepository } from "@/bookings/repository";
import { bookingInteractionPayload } from "@/frontdesk/booking-interaction";
import { handleServiceBookingInteraction } from "@/frontdesk/service-booking-interaction-runtime";
import { ServiceRepositoryBookingAdapter } from "@/integrations/booking-adapter";
import { resolveBookingSystemAdapter } from "@/integrations/booking-adapter-resolver";
import { getVerticalPack } from "@/verticals/registry";

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

beforeEach(() => installBrowserStorage());
afterEach(() => vi.unstubAllGlobals());

const tenantId = "tenant_booking_interaction";
const actorId = "customer_action";

function addPetBooking(repository: BrowserServiceBookingRepository, input?: { startAt?: string; resourceId?: string }) {
  return repository.add({
    tenantId,
    verticalId: "pet-care",
    customerId: "customer_pet_01",
    resourceId: input?.resourceId ?? "groomer_01",
    serviceId: "pet_full_groom",
    startAt: input?.startAt ?? "2026-09-20T10:00:00+08:00",
    durationMin: 120,
    venue: "门店",
    source: "manual",
  });
}

describe("ServiceRepositoryBookingAdapter", () => {
  it("slot generation 使用 Vertical service duration，并避开同资源已有 Booking", async () => {
    const repository = new BrowserServiceBookingRepository();
    const vertical = getVerticalPack("pet-care")!;
    addPetBooking(repository, { startAt: "2026-09-20T10:00:00+08:00" });
    const adapter = new ServiceRepositoryBookingAdapter(vertical, repository, 9, 14);

    const slots = await adapter.findAvailableSlots({
      ctx: { tenantId, actorId },
      resourceId: "groomer_01",
      serviceId: "pet_full_groom",
      from: "2026-09-20T09:00:00+08:00",
      days: 1,
      maxResults: 10,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(
      slots.every(
        (slot) => new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime() === 120 * 60_000,
      ),
    ).toBe(true);
    expect(slots.some((slot) => new Date(slot.startAt).getTime() === new Date("2026-09-20T10:00:00+08:00").getTime())).toBe(false);
  });

  it("reschedule 冲突返回 SLOT_CONFLICT，不改原 Booking", async () => {
    const repository = new BrowserServiceBookingRepository();
    const vertical = getVerticalPack("pet-care")!;
    const first = addPetBooking(repository, { startAt: "2026-09-20T10:00:00+08:00" });
    addPetBooking(repository, { startAt: "2026-09-20T13:00:00+08:00" });
    const adapter = new ServiceRepositoryBookingAdapter(vertical, repository);

    const result = await adapter.reschedule({
      ctx: { tenantId, actorId },
      bookingId: first.id,
      startAt: "2026-09-20T13:30:00+08:00",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("SLOT_CONFLICT");
    expect(repository.get(tenantId, first.id)?.startAt).toBe(first.startAt);
  });
});

describe("Vertical-aware Booking Interaction Runtime", () => {
  it("confirm button 直接更新同一份 ServiceBookingRepository", async () => {
    const repository = new BrowserServiceBookingRepository();
    const vertical = getVerticalPack("pet-care")!;
    const booking = addPetBooking(repository);

    const receipt = await handleServiceBookingInteraction({
      tenantId,
      actorId,
      vertical,
      payload: bookingInteractionPayload({ kind: "confirm", bookingId: booking.id }),
      timezone: "Asia/Hong_Kong",
      serviceBookingRepository: repository,
      now: new Date("2026-09-07T10:00:00+08:00"),
    });

    expect(receipt.ok).toBe(true);
    expect(receipt.status).toBe("completed");
    expect(repository.get(tenantId, booking.id)?.status).toBe("confirmed");
  });

  it("cancel button 在 lead-time 之外会真正取消；太接近服务则转人工且不改状态", async () => {
    const repository = new BrowserServiceBookingRepository();
    const vertical = getVerticalPack("pet-care")!;
    const far = addPetBooking(repository, { startAt: "2026-09-20T10:00:00+08:00" });
    const near = addPetBooking(repository, { startAt: "2026-09-07T18:00:00+08:00", resourceId: "groomer_02" });

    const farReceipt = await handleServiceBookingInteraction({
      tenantId,
      actorId,
      vertical,
      payload: bookingInteractionPayload({ kind: "cancel", bookingId: far.id }),
      timezone: "Asia/Hong_Kong",
      serviceBookingRepository: repository,
      now: new Date("2026-09-07T10:00:00+08:00"),
    });
    const nearReceipt = await handleServiceBookingInteraction({
      tenantId,
      actorId,
      vertical,
      payload: bookingInteractionPayload({ kind: "cancel", bookingId: near.id }),
      timezone: "Asia/Hong_Kong",
      serviceBookingRepository: repository,
      now: new Date("2026-09-07T10:00:00+08:00"),
    });

    expect(farReceipt.status).toBe("completed");
    expect(repository.get(tenantId, far.id)?.status).toBe("cancelled");
    expect(nearReceipt.status).toBe("needs_human");
    expect(repository.get(tenantId, near.id)?.status).toBe("pending");
  });

  it("两步改期：request 返回 slot 按钮，slot payload 再写回新时间并回 pending", async () => {
    const repository = new BrowserServiceBookingRepository();
    const vertical = getVerticalPack("pet-care")!;
    const booking = addPetBooking(repository, { startAt: "2026-09-20T10:00:00+08:00" });

    const choose = await handleServiceBookingInteraction({
      tenantId,
      actorId,
      vertical,
      payload: bookingInteractionPayload({ kind: "reschedule_request", bookingId: booking.id }),
      timezone: "Asia/Hong_Kong",
      serviceBookingRepository: repository,
      now: new Date("2026-09-07T10:00:00+08:00"),
    });
    expect(choose.status).toBe("choose_slot");
    expect(choose.replyOptions.length).toBeGreaterThan(0);

    const selected = choose.replyOptions[0]!;
    const receipt = await handleServiceBookingInteraction({
      tenantId,
      actorId,
      vertical,
      payload: selected.payload,
      timezone: "Asia/Hong_Kong",
      serviceBookingRepository: repository,
      now: new Date("2026-09-07T10:00:00+08:00"),
    });

    expect(receipt.ok).toBe(true);
    expect(receipt.status).toBe("completed");
    expect(repository.get(tenantId, booking.id)?.status).toBe("pending");
    expect(repository.get(tenantId, booking.id)?.startAt).not.toBe(booking.startAt);
  });

  it("Dental resolver 没有 legacy appointment adapter 时 fail-closed", () => {
    const dental = getVerticalPack("dental")!;
    expect(() => resolveBookingSystemAdapter({ vertical: dental })).toThrow(
      "LEGACY_APPOINTMENT_ADAPTER_REQUIRED:dental",
    );
  });
});
