import { jsonrepair } from "jsonrepair";
import type { RawCategorizedSpotlightModel } from "@/lib/market/categorize-market-intel";

export class SpotlightJsonParseError extends Error {
  readonly code = "spotlight_json_parse" as const;

  constructor(
    message: string,
    readonly repairedAttempted = false,
  ) {
    super(message);
    this.name = "SpotlightJsonParseError";
  }
}

export type ParseSpotlightJsonResult = {
  model: RawCategorizedSpotlightModel;
  /** True when jsonrepair (or structural heal) was required. */
  jsonRepaired: boolean;
};

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function normalizeSpotlightShape(
  value: unknown,
): RawCategorizedSpotlightModel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  return {
    growthKeywords: Array.isArray(row.growthKeywords)
      ? (row.growthKeywords as RawCategorizedSpotlightModel["growthKeywords"])
      : [],
    competitorThreats: Array.isArray(row.competitorThreats)
      ? (row.competitorThreats as RawCategorizedSpotlightModel["competitorThreats"])
      : [],
    uxSentimentInsights: Array.isArray(row.uxSentimentInsights)
      ? (row.uxSentimentInsights as RawCategorizedSpotlightModel["uxSentimentInsights"])
      : [],
  };
}

/**
 * Parse Keyword Spotlight model JSON — standard parse first, then jsonrepair.
 */
export function parseSpotlightJson(text: string): ParseSpotlightJsonResult {
  const cleaned = stripJsonFences(text);
  if (!cleaned) {
    throw new SpotlightJsonParseError("Model returned empty JSON.");
  }

  try {
    const direct = normalizeSpotlightShape(JSON.parse(cleaned));
    if (!direct) {
      throw new SyntaxError("Invalid spotlight shape");
    }
    return { model: direct, jsonRepaired: false };
  } catch {
    // fall through to jsonrepair
  }

  try {
    const repairedText = jsonrepair(cleaned);
    const repaired = normalizeSpotlightShape(JSON.parse(repairedText));
    if (!repaired) {
      throw new SpotlightJsonParseError(
        "Repaired JSON did not match spotlight schema.",
        true,
      );
    }
    return { model: repaired, jsonRepaired: true };
  } catch (repairErr) {
    if (repairErr instanceof SpotlightJsonParseError) {
      throw repairErr;
    }
    throw new SpotlightJsonParseError(
      "Could not parse spotlight JSON after repair.",
      true,
    );
  }
}
