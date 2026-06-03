import "server-only";
import { generateListingWithGemini } from "@/lib/gemini/generate-listing";
import type { IssueItem } from "@/lib/gemini/generate-review-analysis";
import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";
import type { GenerateListingWithGeminiResult } from "@/lib/gemini/generate-listing";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PainPointListingInput = {
  /** Display name of the workspace's app. */
  appName: string;
  /** Google Play category string (e.g. "Health & Fitness"). */
  category: string;
  /**
   * Existing ASO keywords for this app — typically from the Keyword Tracker.
   * Passed through to the prompt as-is (capped at 25 inside buildListingOptimizerMessages).
   */
  targetKeywords: string[];
  /**
   * Feature / value-prop description of the app.
   * Used as the "app features" block in the listing prompt.
   */
  appFeatures: string;
  /**
   * Pain-point clusters extracted from competitor 1–2★ reviews.
   * The pipeline converts these into exploit targets automatically —
   * no human prompt intervention required.
   */
  issues: IssueItem[];
  /**
   * Copy tone.  Defaults to "professional" when omitted.
   */
  toneStyle?: ToneStyle;
  /**
   * When true, model returns Arabic copy for all user-visible strings.
   */
  targetArabic?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Severity → displacement urgency weight
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps an IssueItem's severity into a sort weight so CRITICAL issues appear
 * first in the exploit targets list and receive the most prominent treatment
 * in the prompt's displacement block.
 */
const SEVERITY_WEIGHT: Record<IssueItem["severity"], number> = {
  CRITICAL: 0,
  MEDIUM:   1,
  LOW:      2,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core transform — IssueItem[] → exploitTargets: string[]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a list of IssueItem clusters into short exploit-target strings
 * suitable for the displacement-campaign block in buildListingOptimizerMessages.
 *
 * Strategy:
 *   1. Sort by severity (CRITICAL → MEDIUM → LOW), then by impact descending.
 *   2. Cap at 5 (PROMPT_MAX_EXPLOIT_TARGETS enforced inside the prompt builder,
 *      but we cap here too to keep the intent explicit and testable).
 *   3. Each exploit target is the issue title — it is already action-oriented
 *      (≤6 words, e.g. "App Crashes on Launch") which matches the displacement
 *      matching logic in buildListingOptimizerMessages exactly.
 *
 * Why titles, not descriptions?
 * The displacement block uses keyword matching on the exploit target string.
 * Titles are compact, already in the model's training vocabulary for common
 * pain-point categories, and will reliably trigger the right displacement rule
 * (stability, monetization, UX, etc.) without adding noise.
 */
export function buildExploitTargets(issues: IssueItem[]): string[] {
  return [...issues]
    .sort((a, b) => {
      const sw = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
      if (sw !== 0) return sw;
      return b.impact - a.impact; // higher impact first within same severity
    })
    .slice(0, 5)
    .map((issue) => issue.title);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Automated ASO listing generator driven entirely by competitor pain-point data.
 *
 * This is the "Template Engine" the product needs to compete at scale:
 * instead of a human filling in {{APP_NAME}}, {{COMMON_ISSUE}}, {{TONE}}
 * for every user, the pipeline does it automatically:
 *
 *   competitor_insights rows (IssueItem[])
 *     → buildExploitTargets()           — converts clusters to displacement targets
 *     → buildListingOptimizerMessages() — injects targets into the prompt
 *     → generateListingWithGemini()     — calls Gemini with structured schema
 *     → ListingGenerationOutput         — ready to persist + render
 *
 * No human prompt is ever needed.  The caller only supplies static workspace
 * metadata (appName, category, keywords, features) — all competitive
 * positioning is derived automatically from the cached competitor_insights.
 *
 * Credits are NOT consumed here — the API route handles that before calling
 * this function, matching the same pattern as generate-listing.ts.
 */
export async function generatePainPointListing(
  input: PainPointListingInput,
): Promise<GenerateListingWithGeminiResult> {
  const exploitTargets = buildExploitTargets(input.issues);

  const listingInput: ListingOptimizerInput = {
    appName:         input.appName,
    category:        input.category,
    targetKeywords:  input.targetKeywords,
    appFeatures:     input.appFeatures,
    toneStyle:       input.toneStyle ?? "professional",
    targetArabic:    input.targetArabic ?? false,
    exploitTargets,
    // Auto-generated userInstruction that tells the model this is a competitive
    // displacement run — gives it the strategic framing without changing the schema.
    userInstruction: exploitTargets.length > 0
      ? `This listing is a strategic competitive response. The exploit targets above represent real pain points users are reporting about competing apps. Write copy that positions this app as the solution to every one of them — naturally woven in, not as attack copy.`
      : undefined,
  };

  return generateListingWithGemini(listingInput);
}
