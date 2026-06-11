import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { resolveRankDisplay } from "@/lib/keywords/format-rank-display";

const labels = {
  notInTop: "50+",
  pending: "Pending",
  pendingTooltip: "Scanning…",
  outsideTopTooltip: "Not found in top 50.",
};

describe("resolveRankDisplay", () => {
  it("shows Pending only while search is in progress", () => {
    const result = resolveRankDisplay(15, labels, {
      column: "yours",
      isSearchInProgress: true,
      searchComplete: true,
      matchKind: "package",
    });
    assert.equal(result.variant, "pending");
    assert.equal(result.text, "Pending");
  });

  it("shows 50+ after a completed search with no match (sentinel rank)", () => {
    const result = resolveRankDisplay(SERPER_RANK_NOT_IN_FIRST_PAGE, labels, {
      column: "yours",
      searchComplete: true,
      matchKind: "none",
    });
    assert.equal(result.variant, "outsideTop");
    assert.equal(result.text, "50+");
  });

  it("shows 50+ after completed search when rank is null", () => {
    const result = resolveRankDisplay(null, labels, {
      column: "yours",
      searchComplete: true,
      matchKind: "none",
    });
    assert.equal(result.variant, "outsideTop");
    assert.equal(result.text, "50+");
  });

  it("shows em dash before any snapshot exists", () => {
    const result = resolveRankDisplay(null, labels, {
      column: "yours",
      searchComplete: false,
    });
    assert.equal(result.variant, "empty");
    assert.equal(result.text, "—");
  });
});
