import type { ScheduledBooking } from "@/scheduling/types";
import type { ServiceConversationMessage } from "@/conversations/types";

export type JourneyStatus = "waiting" | "en_route" | "arrived" | "completed" | "cancelled";
export type JourneySide = "customer" | "worker";
export interface JourneyPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  at: number;
}
export interface JourneyMessage extends Pick<ServiceConversationMessage, "id" | "text" | "at"> {
  from: JourneySide;
}
export interface JourneyView {
  jobId: string;
  service: string;
  workerName: string;
  side: JourneySide;
  status: JourneyStatus;
  sharing: boolean;
  shareUntil: number;
  position: JourneyPosition | null;
  messages: JourneyMessage[];
  expiresAt: number;
}
export type JourneyCommand =
  | { type: "status"; status: JourneyStatus }
  | { type: "sharing"; enabled: boolean }
  | { type: "position"; lease: string; position: JourneyPosition }
  | { type: "message"; id: string; text: string };

interface JourneyRecord {
  booking: ScheduledBooking;
  workerName: string;
  service: string;
  status: JourneyStatus;
  lease: string | null;
  shareUntil: number;
  position: JourneyPosition | null;
  messages: JourneyMessage[];
  expiresAt: number;
  tokens: Record<JourneySide, string>;
}

/** Single-process development transport store. Production must supply an authenticated,
 * durable booking owner; browser-provided bookings must never provision production access. */
export class JourneyRuntime {
  private readonly records = new Map<string, JourneyRecord>();
  constructor(private readonly now = () => Date.now()) {}

  private prune() {
    for (const [key, row] of this.records) {
      if (row.expiresAt <= this.now()) this.records.delete(key);
    }
  }

  provision(booking: ScheduledBooking, workerName: string, service: string) {
    this.prune();
    if (
      !["SCHEDULED", "CUSTOMER_CONFIRMED", "WORKER_NOTIFIED", "IN_PROGRESS"].includes(booking.state)
    ) {
      throw new Error("BOOKING_NOT_ACTIVE");
    }
    if (
      ![
        booking.tenantId,
        booking.verticalId,
        booking.jobId,
        booking.workerId,
        booking.customerId,
      ].every(Boolean)
    ) {
      throw new Error("BOOKING_SCOPE_REQUIRED");
    }
    const key = JSON.stringify([booking.tenantId, booking.verticalId, booking.jobId]);
    const existing = this.records.get(key);
    // Reprovisioning cannot silently rotate a live order or change its participants.
    if (existing) throw new Error("JOURNEY_ALREADY_CREATED");
    if (this.records.size >= 100) throw new Error("DEMO_CAPACITY_REACHED");
    const tokens = {
      customer: crypto.randomUUID() + crypto.randomUUID(),
      worker: crypto.randomUUID() + crypto.randomUUID(),
    };
    this.records.set(key, {
      booking: structuredClone(booking),
      workerName,
      service,
      tokens,
      status: "waiting",
      lease: null,
      shareUntil: 0,
      position: null,
      messages: [],
      expiresAt: this.now() + 4 * 60 * 60_000,
    });
    return tokens;
  }

  private authorize(token: string) {
    this.prune();
    for (const row of this.records.values()) {
      const side: JourneySide | null =
        row.tokens.customer === token ? "customer" : row.tokens.worker === token ? "worker" : null;
      if (side) {
        if (row.shareUntil <= this.now()) {
          row.lease = null;
          row.position = null;
        }
        return { row, side };
      }
    }
    throw new Error("LINK_EXPIRED_OR_INVALID");
  }

  read(token: string): JourneyView {
    const { row, side } = this.authorize(token);
    const fresh = row.position && this.now() - row.position.at <= 60_000;
    return structuredClone({
      jobId: row.booking.jobId,
      service: row.service,
      workerName: row.workerName,
      side,
      status: row.status,
      sharing: Boolean(row.lease),
      shareUntil: row.shareUntil,
      position: row.lease && fresh ? row.position : null,
      messages: row.messages,
      expiresAt: row.expiresAt,
    });
  }

  command(token: string, command: JourneyCommand): { lease: string | null; view: JourneyView } {
    const { row, side } = this.authorize(token);
    const terminal = row.status === "completed" || row.status === "cancelled";
    if (terminal) throw new Error("JOURNEY_CLOSED");
    if (command.type !== "message" && side !== "worker") throw new Error("WORKER_REQUIRED");
    switch (command.type) {
      case "status": {
        const next: Record<JourneyStatus, JourneyStatus[]> = {
          waiting: ["en_route", "cancelled"],
          en_route: ["arrived", "cancelled"],
          arrived: ["completed", "cancelled"],
          completed: [],
          cancelled: [],
        };
        if (!next[row.status].includes(command.status)) throw new Error("INVALID_TRANSITION");
        row.status = command.status;
        if (row.status !== "en_route") {
          row.lease = null;
          row.shareUntil = 0;
          row.position = null;
        }
        break;
      }
      case "sharing":
        if (command.enabled && row.status !== "en_route") throw new Error("DEPART_FIRST");
        row.lease = command.enabled ? crypto.randomUUID() : null;
        row.shareUntil = command.enabled ? Math.min(this.now() + 60 * 60_000, row.expiresAt) : 0;
        row.position = null;
        break;
      case "position": {
        if (!row.lease || command.lease !== row.lease || row.status !== "en_route")
          throw new Error("SHARING_REVOKED");
        const p = command.position;
        if (
          ![p.latitude, p.longitude, p.accuracy, p.at].every(Number.isFinite) ||
          Math.abs(p.latitude) > 90 ||
          Math.abs(p.longitude) > 180 ||
          p.accuracy < 0 ||
          p.accuracy > 10000
        )
          throw new Error("INVALID_POSITION");
        if (
          p.at < this.now() - 60_000 ||
          p.at > this.now() + 5000 ||
          (row.position && p.at <= row.position.at)
        )
          throw new Error("STALE_POSITION");
        row.position = structuredClone(p);
        break;
      }
      case "message": {
        if (
          !command.text.trim() ||
          command.text.length > 2000 ||
          !command.id ||
          command.id.length > 100
        )
          throw new Error("INVALID_MESSAGE");
        const previous = row.messages.find((m) => m.id === command.id && m.from === side);
        if (previous && previous.text !== command.text.trim())
          throw new Error("MESSAGE_ID_CONFLICT");
        if (!previous) {
          if (row.messages.length >= 200) throw new Error("DEMO_MESSAGE_LIMIT");
          row.messages.push({
            id: command.id,
            from: side,
            text: command.text.trim(),
            at: new Date(this.now()).toISOString(),
          });
        }
        break;
      }
    }
    return { lease: side === "worker" ? row.lease : null, view: this.read(token) };
  }
}
