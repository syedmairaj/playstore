import { describe, expect, it } from "vitest";
import {
  applySignalLifecycleStatus,
  readSignalLifecycleStatus,
  SIGNAL_LIFECYCLE_STATUS,
} from "@/lib/signals/signal-lifecycle";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

function strength(overrides: Partial<OptimizationQueueItem>): OptimizationQueueItem {
  return {
    id: "s-1",
    type: "competitor_strength",
    category: "strength",
    content: "offline sync",
    source: "competitor_spy",
    language: "en",
    stagedAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe("signal-lifecycle", () => {
  it("reads top-level status first", () => {
    expect(
      readSignalLifecycleStatus(strength({ status: SIGNAL_LIFECYCLE_STATUS.ACTIVE })),
    ).toBe(SIGNAL_LIFECYCLE_STATUS.ACTIVE);
  });

  it("migrates legacy metadata.status on read (normalization only)", () => {
    expect(
      readSignalLifecycleStatus(
        strength({ metadata: { status: "ACTIVE_CONTEXT" } }),
      ),
    ).toBe(SIGNAL_LIFECYCLE_STATUS.ACTIVE);
  });

  it("applySignalLifecycleStatus sets top-level and strips legacy metadata", () => {
    const next = applySignalLifecycleStatus(
      strength({
        metadata: { move_to_active_context: true, audit_status: "approved" },
      }),
      SIGNAL_LIFECYCLE_STATUS.ACTIVE,
    );
    expect(next.status).toBe(SIGNAL_LIFECYCLE_STATUS.ACTIVE);
    expect(next.metadata.move_to_active_context).toBeUndefined();
    expect(next.metadata.audit_status).toBeUndefined();
  });
});
