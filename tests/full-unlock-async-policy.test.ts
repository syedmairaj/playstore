import { describe, expect, it } from "vitest";
import { shouldPreferAsyncFullUnlock } from "@/lib/listing/full-unlock-async-policy";

describe("shouldPreferAsyncFullUnlock", () => {
  it("returns false for light vault context", () => {
    const decision = shouldPreferAsyncFullUnlock({
      vaultItemCount: 5,
      clientQueueItemCount: 3,
      listingInput: { trackedKeywordSignals: [{ keyword: "a", confidence: 80 }] },
    });
    expect(decision.preferAsync).toBe(false);
  });

  it("prefers async when vault item count is heavy", () => {
    const decision = shouldPreferAsyncFullUnlock({ vaultItemCount: 25 });
    expect(decision.preferAsync).toBe(true);
    expect(decision.reason).toContain("vault_item_count");
  });

  it("prefers async when client queue items are heavy", () => {
    const decision = shouldPreferAsyncFullUnlock({ clientQueueItemCount: 20 });
    expect(decision.preferAsync).toBe(true);
    expect(decision.reason).toContain("client_queue_items");
  });

  it("respects LISTING_FULL_FORCE_ASYNC env", () => {
    const prev = process.env.LISTING_FULL_FORCE_ASYNC;
    process.env.LISTING_FULL_FORCE_ASYNC = "1";
    expect(shouldPreferAsyncFullUnlock({}).preferAsync).toBe(true);
    process.env.LISTING_FULL_FORCE_ASYNC = prev;
  });
});
