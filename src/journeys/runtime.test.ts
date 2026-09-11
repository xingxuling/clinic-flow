import { describe, expect, it } from "vitest";
import { JourneyRuntime } from "@/journeys/runtime";
import type { ScheduledBooking } from "@/scheduling/types";

const date = "2026-09-11T09:00:00.000Z";
const booking: ScheduledBooking = {
  bookingId: "booking-1",
  tenantId: "tenant-a",
  verticalId: "home-service",
  serviceRequestId: "request-1",
  customerId: "customer-a",
  workerId: "worker-a",
  serviceType: "cleaning",
  startAt: date,
  endAt: date,
  occupancyStartAt: date,
  occupancyEndAt: date,
  state: "SCHEDULED",
  holdId: "hold-1",
  jobId: "job-1",
  idempotencyKey: "booking-key",
  createdAt: date,
  updatedAt: date,
};
function setup() {
  let now = Date.parse(date);
  const runtime = new JourneyRuntime(() => now);
  const tokens = runtime.provision(booking, "陳師傅", "上門清潔");
  const start = () => {
    runtime.command(tokens.worker, { type: "status", status: "en_route" });
    return runtime.command(tokens.worker, { type: "sharing", enabled: true }).lease!;
  };
  const position = () => ({ latitude: 22.3, longitude: 114.17, accuracy: 10, at: now });
  return {
    runtime,
    tokens,
    start,
    position,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("order journey authorization and lifecycle", () => {
  it("does not expose a position until the worker explicitly enables it", () => {
    const s = setup();
    expect(s.runtime.read(s.tokens.customer).position).toBeNull();
    expect(() => s.runtime.command(s.tokens.worker, { type: "sharing", enabled: true })).toThrow(
      "DEPART_FIRST",
    );
    const lease = s.start();
    s.runtime.command(s.tokens.worker, { type: "position", lease, position: s.position() });
    expect(s.runtime.read(s.tokens.customer).position?.latitude).toBe(22.3);
    expect(s.runtime.read(s.tokens.customer)).not.toHaveProperty("lease");
    expect(s.runtime.read(s.tokens.customer)).not.toHaveProperty("tokens");
  });
  it("rejects customer state/position changes and invalid access links", () => {
    const s = setup();
    expect(() =>
      s.runtime.command(s.tokens.customer, { type: "status", status: "en_route" }),
    ).toThrow("WORKER_REQUIRED");
    expect(() => s.runtime.read("invalid")).toThrow("LINK_EXPIRED_OR_INVALID");
  });
  it("binds each order to its own participants across tenants", () => {
    const s = setup();
    const other = s.runtime.provision({ ...booking, tenantId: "tenant-b" }, "另一位師傅", "清潔");
    s.runtime.command(s.tokens.customer, { type: "message", id: "1", text: "本單訊息" });
    expect(s.runtime.read(other.customer).messages).toEqual([]);
    expect(s.runtime.read(other.worker).messages).toEqual([]);
    expect(() =>
      s.runtime.provision({ ...booking, workerId: "attacker" }, "attacker", "service"),
    ).toThrow("JOURNEY_ALREADY_CREATED");
  });
  it("revocation erases the marker and rejects delayed callbacks including after re-enable", () => {
    const s = setup();
    const lease = s.start();
    s.runtime.command(s.tokens.worker, { type: "position", lease, position: s.position() });
    s.runtime.command(s.tokens.worker, { type: "sharing", enabled: false });
    expect(s.runtime.read(s.tokens.customer).position).toBeNull();
    s.runtime.command(s.tokens.worker, { type: "sharing", enabled: true });
    expect(() =>
      s.runtime.command(s.tokens.worker, { type: "position", lease, position: s.position() }),
    ).toThrow("SHARING_REVOKED");
  });
  it("expires stale positions, rejects future/invalid/older samples, and expires consent", () => {
    const s = setup();
    const lease = s.start();
    s.runtime.command(s.tokens.worker, { type: "position", lease, position: s.position() });
    expect(() =>
      s.runtime.command(s.tokens.worker, { type: "position", lease, position: s.position() }),
    ).toThrow("STALE_POSITION");
    expect(() =>
      s.runtime.command(s.tokens.worker, {
        type: "position",
        lease,
        position: { ...s.position(), latitude: 91 },
      }),
    ).toThrow("INVALID_POSITION");
    expect(() =>
      s.runtime.command(s.tokens.worker, {
        type: "position",
        lease,
        position: { ...s.position(), at: s.position().at + 10000 },
      }),
    ).toThrow("STALE_POSITION");
    s.advance(61000);
    expect(s.runtime.read(s.tokens.customer).position).toBeNull();
    s.advance(3600000);
    expect(s.runtime.read(s.tokens.customer).sharing).toBe(false);
    expect(() =>
      s.runtime.command(s.tokens.worker, { type: "position", lease, position: s.position() }),
    ).toThrow("SHARING_REVOKED");
  });
  it.each(["arrived", "cancelled"] as const)("stops location on %s", (status) => {
    const s = setup();
    const lease = s.start();
    s.runtime.command(s.tokens.worker, { type: "position", lease, position: s.position() });
    s.runtime.command(s.tokens.worker, { type: "status", status });
    expect(s.runtime.read(s.tokens.customer).position).toBeNull();
    expect(s.runtime.read(s.tokens.customer).sharing).toBe(false);
  });
  it("messages work without location, retry once, and reject altered replay", () => {
    const s = setup();
    const command = { type: "message" as const, id: "same-id", text: "我到門口了" };
    s.runtime.command(s.tokens.worker, command);
    s.runtime.command(s.tokens.worker, command);
    s.runtime.command(s.tokens.customer, { ...command, text: "收到" });
    expect(s.runtime.read(s.tokens.customer).messages.map((m) => m.text)).toEqual([
      "我到門口了",
      "收到",
    ]);
    expect(() => s.runtime.command(s.tokens.worker, { ...command, text: "更改" })).toThrow(
      "MESSAGE_ID_CONFLICT",
    );
  });
  it("completion closes mutations and expired links cannot read messages", () => {
    const s = setup();
    s.start();
    s.runtime.command(s.tokens.worker, { type: "status", status: "arrived" });
    s.runtime.command(s.tokens.worker, { type: "status", status: "completed" });
    expect(() => s.runtime.command(s.tokens.worker, { type: "sharing", enabled: true })).toThrow(
      "JOURNEY_CLOSED",
    );
    s.advance(4 * 3600000);
    expect(() => s.runtime.read(s.tokens.customer)).toThrow("LINK_EXPIRED_OR_INVALID");
  });
});
