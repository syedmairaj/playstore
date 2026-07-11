import { describe, expect, it } from "vitest";
import {
  buildKeywordRankCorrelation,
  buildLiveRankTrackingFromBundle,
  detectPerformanceAlerts,
  HIGH_VOLUME_SEARCH_THRESHOLD,
  PERFORMANCE_ALERT_DROP_POSITIONS,
} from "@/lib/market/rank-correlation";
import type { MarketRankBundle } from "@/lib/market/rank-tracking-bundle";

const NOW = Date.parse("2026-07-07T12:00:00.000Z");

function bundle(overrides: Partial<MarketRankBundle> = {}): MarketRankBundle {
  return {
    appId: "app-1",
    deploymentDate: "2026-06-01T00:00:00.000Z",
    deploymentVersionNumber: 1,
    deploymentVersionId: "ver-1",
    keywords: [
      {
        id: "kw-1",
        term: "fitness tracker",
        market: "us",
        rank_at_last_listing_optimization: null,
      },
    ],
    snapshotsByKeyword: new Map(),
    keywordScope: "workspace",
    monitoringByKeywordMarket: new Map(),
    ...overrides,
  };
}

describe("rank-correlation", () => {
  it("buildKeywordRankCorrelation compares deployment baseline to latest rank", () => {
    const b = bundle({
      snapshotsByKeyword: new Map([
        [
          "kw-1",
          [
            {
              keyword_id: "kw-1",
              rank: 30,
              snapshot_at: "2026-05-28T00:00:00.000Z",
              country_code: "us",
              search_volume: 500,
            },
            {
              keyword_id: "kw-1",
              rank: 20,
              snapshot_at: "2026-07-07T10:00:00.000Z",
              country_code: "us",
              search_volume: 500,
            },
          ],
        ],
      ]),
    });

    const row = buildKeywordRankCorrelation(b, b.keywords[0]!, NOW);
    expect(row.preDeploymentRank).toBe(30);
    expect(row.currentRank).toBe(20);
    expect(row.rankChange).toBe(10);
    expect(row.sparkline7d).toHaveLength(7);
  });

  it("detectPerformanceAlerts flags high-volume 48h drops", () => {
    const b = bundle({
      snapshotsByKeyword: new Map([
        [
          "kw-1",
          [
            {
              keyword_id: "kw-1",
              rank: 10,
              snapshot_at: "2026-07-05T12:00:00.000Z",
              country_code: "us",
              search_volume: HIGH_VOLUME_SEARCH_THRESHOLD,
            },
            {
              keyword_id: "kw-1",
              rank: 14,
              snapshot_at: "2026-07-07T10:00:00.000Z",
              country_code: "us",
              search_volume: HIGH_VOLUME_SEARCH_THRESHOLD,
            },
          ],
        ],
      ]),
    });

    const row = buildKeywordRankCorrelation(b, b.keywords[0]!, NOW);
    const alerts = detectPerformanceAlerts([row], b, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.positionsDropped).toBeGreaterThanOrEqual(
      PERFORMANCE_ALERT_DROP_POSITIONS,
    );
  });

  it("buildLiveRankTrackingFromBundle sorts by rank change descending", () => {
    const b = bundle({
      keywords: [
        {
          id: "kw-1",
          term: "alpha",
          market: "us",
          rank_at_last_listing_optimization: null,
        },
        {
          id: "kw-2",
          term: "beta",
          market: "us",
          rank_at_last_listing_optimization: null,
        },
      ],
      snapshotsByKeyword: new Map([
        [
          "kw-1",
          [
            {
              keyword_id: "kw-1",
              rank: 25,
              snapshot_at: "2026-05-28T00:00:00.000Z",
              country_code: "us",
            },
            {
              keyword_id: "kw-1",
              rank: 20,
              snapshot_at: "2026-07-07T10:00:00.000Z",
              country_code: "us",
            },
          ],
        ],
        [
          "kw-2",
          [
            {
              keyword_id: "kw-2",
              rank: 15,
              snapshot_at: "2026-05-28T00:00:00.000Z",
              country_code: "us",
            },
            {
              keyword_id: "kw-2",
              rank: 10,
              snapshot_at: "2026-07-07T10:00:00.000Z",
              country_code: "us",
            },
          ],
        ],
      ]),
    });

    const result = buildLiveRankTrackingFromBundle(b, NOW);
    expect(result.rows[0]?.term).toBe("alpha");
    expect(result.rows[1]?.term).toBe("beta");
    expect(result.rows[0]?.rankChange).toBe(5);
  });
});
