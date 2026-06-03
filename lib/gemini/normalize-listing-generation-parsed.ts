import "server-only";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Maps Gemini / persisted JSON variants onto the shape expected by clamp + Zod
 * (e.g. `longDescription` → `fullDescription`, snake_case ASO keys → camelCase).
 */
export function normalizeListingGenerationParsed(parsed: unknown): unknown {
  const o = asRecord(parsed);
  if (!o) return parsed;

  const next: Record<string, unknown> = { ...o };

  const longDesc = next.longDescription;
  const fullDesc = next.fullDescription;
  if (typeof longDesc === "string" && longDesc.trim()) {
    if (typeof fullDesc !== "string" || !fullDesc.trim()) {
      next.fullDescription = longDesc;
    }
  }
  delete next.longDescription;

  if (typeof next.aso_score === "number" || typeof next.aso_score === "string") {
    const n = num(next.aso_score);
    if (n !== undefined) next.asoScore = Math.round(n);
    delete next.aso_score;
  }

  if (Array.isArray(next.improvement_tips)) {
    next.improvementTips = next.improvement_tips;
    delete next.improvement_tips;
  }

  const rawBreak =
    asRecord(next.score_breakdown) ?? asRecord(next.scoreBreakdown);
  if (rawBreak) {
    next.scoreBreakdown = {
      title: num(rawBreak.title) ?? 0,
      shortDescription:
        num(rawBreak.shortDescription) ??
        num(rawBreak.short_description) ??
        0,
      longDescription:
        num(rawBreak.longDescription) ??
        num(rawBreak.long_description) ??
        0,
      persuasiveness: num(rawBreak.persuasiveness) ?? 0,
    };
    delete next.score_breakdown;
  }

  return next;
}

/** True if the raw object carried any ASO-score keys (snake or camel). */
export function rawListingHadAsoScoreKeys(parsed: unknown): boolean {
  const o = asRecord(parsed);
  if (!o) return false;
  if ("aso_score" in o || "asoScore" in o) return true;
  if ("score_breakdown" in o || "scoreBreakdown" in o) return true;
  if ("improvement_tips" in o || "improvementTips" in o) return true;
  return false;
}
