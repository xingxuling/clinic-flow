import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { JourneyRuntime, type JourneyCommand } from "@/journeys/runtime";
import type { ScheduledBooking } from "@/scheduling/types";

const runtime = new JourneyRuntime();
const token = z.string().length(72);
const id = z.string().min(1).max(128);
function developmentOnly() {
  if (process.env["NODE_ENV"] !== "development")
    throw new Error("JOURNEY_PRODUCTION_PROVIDER_REQUIRED");
}
const bookingSchema = z.object({
  bookingId: id,
  tenantId: id,
  verticalId: id,
  serviceRequestId: id,
  customerId: id,
  workerId: id,
  serviceType: id,
  jobId: id,
  state: z.enum(["SCHEDULED", "CUSTOMER_CONFIRMED", "WORKER_NOTIFIED", "IN_PROGRESS"]),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  occupancyStartAt: z.string().datetime(),
  occupancyEndAt: z.string().datetime(),
  holdId: id,
  idempotencyKey: id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const provisionJourney = createServerFn({ method: "POST" })
  .validator(z.object({ booking: bookingSchema, workerName: id, service: id }))
  .handler(({ data }) => {
    developmentOnly();
    return runtime.provision(data.booking as ScheduledBooking, data.workerName, data.service);
  });
export const readJourney = createServerFn({ method: "POST" })
  .validator(z.object({ token }))
  .handler(({ data }) => {
    developmentOnly();
    return runtime.read(data.token);
  });
const command = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    status: z.enum(["waiting", "en_route", "arrived", "completed", "cancelled"]),
  }),
  z.object({ type: z.literal("sharing"), enabled: z.boolean() }),
  z.object({
    type: z.literal("position"),
    lease: z.string().uuid(),
    position: z.object({
      latitude: z.number().finite(),
      longitude: z.number().finite(),
      accuracy: z.number().finite(),
      at: z.number().finite(),
    }),
  }),
  z.object({
    type: z.literal("message"),
    id: z.string().min(1).max(100),
    text: z.string().min(1).max(2000),
  }),
]);
export const updateJourney = createServerFn({ method: "POST" })
  .validator(z.object({ token, command }))
  .handler(({ data }) => {
    developmentOnly();
    return runtime.command(data.token, data.command as JourneyCommand);
  });
