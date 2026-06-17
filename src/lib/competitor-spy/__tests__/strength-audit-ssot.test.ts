import { describe, expect, it } from "vitest";
import {
  demoteCompetitorStrengthItem,
  filterQueueForActiveContextDisplay,
  filterQueueForAuditQueueDisplay,
  isApprovedCompetitorStrength,
} from "@/lib/competitor-spy/strength-audit-ssot";
import { SIGNAL_LIFECYCLE_STATUS } from "@/lib/signals/signal-lifecycle";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

function strength(overrides: Partial<OptimizationQueueItem>): OptimizationQueueItem {
  return {
    id: "s-1",
    type: "competitor_strength",
    category: "strength",
    content: "barcode scanner",
    source: "competitor_spy",
    language: "en",
    stagedAt: new Date().toISOString(),
    metadata: { from_strength_audit: true },
    ...overrides,
  };
}

describe("strength-audit-ssot", () => {
  it("approves ACTIVE status only (strict top-level column)", () => {
    expect(isApprovedCompetitorStrength(strength({ status: SIGNAL_LIFECYCLE_STATUS.ACTIVE }))).toBe(
      true,
    );
    expect(isApprovedCompetitorStrength(strength({ status: SIGNAL_LIFECYCLE_STATUS.AUDIT }))).toBe(
      false,
    );
    expect(isApprovedCompetitorStrength(strength({ metadata: { status: "ACTIVE" } }))).toBe(false);
  });

  it("filters audit queue by status === AUDIT", () => {
    const items = [
      strength({ id: "a", status: SIGNAL_LIFECYCLE_STATUS.AUDIT }),
      strength({ id: "b", status: SIGNAL_LIFECYCLE_STATUS.ACTIVE }),
      strength({ id: "c", status: SIGNAL_LIFECYCLE_STATUS.DISCOVERY }),
    ];
    expect(filterQueueForAuditQueueDisplay(items)).toHaveLength(1);
    expect(filterQueueForAuditQueueDisplay(items)[0]?.id).toBe("a");
  });

  it("filters active context by status === ACTIVE", () => {
    const items = [
      strength({ id: "a", status: SIGNAL_LIFECYCLE_STATUS.AUDIT }),
      strength({ id: "b", status: SIGNAL_LIFECYCLE_STATUS.ACTIVE }),
    ];
    expect(filterQueueForActiveContextDisplay(items)).toHaveLength(1);
    expect(filterQueueForActiveContextDisplay(items)[0]?.id).toBe("b");
  });

  it("demote preserves row and sets status AUDIT", () => {
    const demoted = demoteCompetitorStrengthItem(
      strength({
        status: SIGNAL_LIFECYCLE_STATUS.ACTIVE,
        metadata: { move_to_active_context: true, status: "ACTIVE" },
      }),
    );
    expect(demoted.status).toBe(SIGNAL_LIFECYCLE_STATUS.AUDIT);
    expect(demoted.metadata.move_to_active_context).toBeUndefined();
    expect(demoted.metadata.status).toBeUndefined();
  });
});
