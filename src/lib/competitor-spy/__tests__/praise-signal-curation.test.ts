import { describe, expect, it } from "vitest";
import {
  MARKET_DOMINATING_IMPACT_THRESHOLD,
  migrateLegacyPraiseTerms,
  splitPraiseSignals,
} from "@/lib/competitor-spy/praise-signal-curation";

describe("praise-signal-curation", () => {
  it("splits baseline vs market-dominating by impact threshold", () => {
    const signals = migrateLegacyPraiseTerms([
      "easy food logging",
      "extensive food database",
      "barcode scanner works",
    ]);
    const { userAppreciated, marketDominatingCandidates } = splitPraiseSignals(signals);

    expect(userAppreciated.length + marketDominatingCandidates.length).toBe(signals.length);
    for (const candidate of marketDominatingCandidates) {
      expect(candidate.conversionImpactScore).toBeGreaterThanOrEqual(
        MARKET_DOMINATING_IMPACT_THRESHOLD,
      );
    }
  });
});
