import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { snapshotRankEntrySchema } from "@/lib/validation/keyword-serper-save-body";

describe("snapshotRankEntrySchema", () => {
  it("coerces null rank to not-in-page sentinel", () => {
    const parsed = snapshotRankEntrySchema.parse({ country: "us", rank: null });
    assert.equal(parsed.rank, SERPER_RANK_NOT_IN_FIRST_PAGE);
  });

  it("accepts a valid in-range rank", () => {
    const parsed = snapshotRankEntrySchema.parse({ country: "in", rank: 12 });
    assert.equal(parsed.rank, 12);
  });
});
