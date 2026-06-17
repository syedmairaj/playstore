import { describe, expect, test } from "vitest";
import { parseSpotlightJson } from "../parse-spotlight-json";

describe("parseSpotlightJson", () => {
  test("parses valid JSON", () => {
    const raw = JSON.stringify({
      growthKeywords: [{ term: "fitness", searchVolumeScore: 80, conversionImpactScore: 70 }],
      competitorThreats: [],
      uxSentimentInsights: [],
    });
    const result = parseSpotlightJson(raw);
    expect(result.jsonRepaired).toBe(false);
    expect(result.model.growthKeywords).toHaveLength(1);
  });

  test("repairs truncated JSON with jsonrepair", () => {
    const raw =
      '{"growthKeywords":[{"term":"fitness","searchVolumeScore":80,"conversionImpactScore":70}],"competitorThreats":[]';
    const result = parseSpotlightJson(raw);
    expect(result.jsonRepaired).toBe(true);
    expect(result.model.growthKeywords?.[0]?.term).toBe("fitness");
  });

  test("throws on unrecoverable garbage", () => {
    expect(() => parseSpotlightJson("not json at all")).toThrow();
  });
});
