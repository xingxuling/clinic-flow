import { describe, expect, it } from "vitest";

import {
  assertServiceRequestTransition,
  canTransitionServiceRequest,
  isTerminalServiceRequestStatus,
  SERVICE_REQUEST_TRANSITIONS,
} from "@/scheduling/state-machine";
import type { ServiceRequestStatus } from "@/scheduling/types";

describe("ServiceRequest state machine", () => {
  it("允许的生命周期转换均可执行，终态不再外流", () => {
    for (const [from, targets] of Object.entries(SERVICE_REQUEST_TRANSITIONS) as [
      ServiceRequestStatus,
      readonly ServiceRequestStatus[],
    ][]) {
      for (const to of targets) {
        expect(canTransitionServiceRequest(from, to)).toBe(true);
        expect(() => assertServiceRequestTransition(from, to)).not.toThrow();
      }
      if (targets.length === 0) expect(isTerminalServiceRequestStatus(from)).toBe(true);
    }
  });

  it("拒绝跳过 hold/通知阶段，以及所有非法终态外流", () => {
    const invalidTransitions: [ServiceRequestStatus, ServiceRequestStatus][] = [
      ["DRAFT", "HELD"],
      ["HELD", "SCHEDULED"],
      ["CUSTOMER_CONFIRMED", "SCHEDULED"],
      ["COMPLETED", "MATCHING"],
      ["EXPIRED", "MATCHING"],
      ["CANCELLED", "SCHEDULED"],
    ];

    for (const [from, to] of invalidTransitions) {
      expect(canTransitionServiceRequest(from, to)).toBe(false);
      expect(() => assertServiceRequestTransition(from, to)).toThrow(
        `INVALID_SERVICE_REQUEST_TRANSITION:${from}->${to}`,
      );
    }
  });
});
