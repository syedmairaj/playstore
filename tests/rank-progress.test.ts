import { describe, expect, it } from "vitest";
import {
  computePositionsGained,
  isRankWin,
  MIN_RANK_WIN_POSITIONS,
  rankAtOrBeforeDeployment,
} from "@/lib/market/rank-progress";

describe("rank-progress", () => {
  it("rankAtOrBeforeDeployment picks newest snapshot at or before deployment", () => {
    const result = rankAtOrBeforeDeployment(
      [
        { rank: 30, snapshot_at: "2026-06-01T00:00:00.000Z", country_code: "us" },
        { rank: 20, snapshot_at: "2026-06-10T00:00:00.000Z", country_code: "us" },
        { rank: 15, snapshot_at: "2026-06-20T00:00:00.000Z", country_code: "us" },
      ],
      "us",
      "2026-06-15T00:00:00.000Z",
    );
    expect(result.rank).toBe(20);
    expect(result.snapshotAt).toBe("2026-06-10T00:00:00.000Z");
  });

  it("computePositionsGained treats lower rank as improvement", () => {
    expect(computePositionsGained(25, 18)).toBe(7);
    expect(computePositionsGained(18, 25)).toBe(-7);
  });

  it("isRankWin requires at least MIN_RANK_WIN_POSITIONS gain", () => {
    expect(isRankWin(1)).toBe(false);
    expect(isRankWin(MIN_RANK_WIN_POSITIONS)).toBe(true);
    expect(isRankWin(5)).toBe(true);
    expect(isRankWin(-3)).toBe(false);
  });
});
