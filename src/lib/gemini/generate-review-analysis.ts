import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { extractText, extractUsageMetadata } from "@/lib/ai/extract-model-text";
import type { GeminiUsageCounts } from "@/lib/gemini/pricing";
import { parseGeminiUsageMetadata } from "@/lib/gemini/pricing";
import type { ReviewInsightCategory } from "@/lib/review-insights/pending-insights.types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Severity tier for a Common Issues card.
 *   CRITICAL — crashes, data loss, broken core feature, login failures
 *   MEDIUM   — major performance regressions, key flows broken or very annoying
 *   LOW      — noticeable annoyances, missing quality-of-life features
 *
 * Note: enum aligned with responseSchema below — three values only.
 */
export type IssueSeverity = "CRITICAL" | "MEDIUM" | "LOW";

/**
 * A single pain-point cluster returned by the Gemini analysis.
 * `impact` is a fraction [0.0–1.0]; multiply by 100 for % display.
 */
export type IssueItem = {
  /** Action-oriented card title, ≤ 60 chars. */
  title: string;
  /** One concise sentence explaining the problem and its user impact. */
  description: string;
  /** Severity tier. */
  severity: IssueSeverity;
  /**
   * Fraction of sampled ≤2★ reviews mentioning this issue (0.0–1.0).
   * Normalised from Gemini's string percentage output (e.g. "45%") at parse time.
   */
  impact: number;
  /**
   * Verbatim snippet from one of the source reviews, ≤ 200 chars.
   * Empty string when no clean excerpt exists.
   */
  quote: string;
  /** ASO cluster category for curation UI. */
  category?: ReviewInsightCategory;
};

export type ReviewAnalysisResult = {
  issues: IssueItem[];
  usage: GeminiUsageCounts | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard cap on reviews passed to Gemini.
 * 20 high-density rows keeps the prompt compact, avoids TPM ceiling hits under
 * concurrent load, and stays well within the output budget.
 * Reviews shorter than MIN_REVIEW_CHARS are filtered out before this cap is
 * applied so every slot contains substantive complaint text.
 */
const MAX_REVIEWS_FOR_PROMPT = 20;

/**
 * Minimum character length a review must have to be included in the prompt.
 * Filters out low-signal entries like "bad", "ok", "👎" that add noise without
 * helping the model identify meaningful pain-point clusters.
 */
const MIN_REVIEW_CHARS = 30;

/** Maximum issues the model may return. UI grid cap. */
const MAX_ISSUES = 5;

// No PARSE_FALLBACK_ITEM — parse failures now return { issues: [], usage } so
// the route does NOT upsert a synthetic sentinel card into competitor_insights.
// The GET handler returns hasBeenAnalyzed=false on an empty-array row, which
// correctly re-shows the paywall rather than rendering a fake IssueCard.

// ─────────────────────────────────────────────────────────────────────────────
// Gemini responseSchema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strict JSON schema enforced by the Gemini SDK.
 *
 * Using `responseSchema` + `responseMimeType: "application/json"` forces the
 * model to emit structurally valid JSON that matches this shape exactly.  This
 * eliminates the "Unterminated string / JSON.parse failed" crash that occurs
 * when gemini-2.5-flash truncates mid-output with loose text generation.
 *
 * Key design decisions:
 * - `impact` is a STRING percentage (e.g. "45%") — a bounded string token is
 *   far less likely to cause truncation than an open-ended floating-point token
 *   sequence.  We parse it back to a [0,1] float in `parseIssues`.
 * - `severity` is an enum — limits the model's token choices and prevents
 *   hallucinated values.
 * - `quote` is omitted from the schema — its unbounded text is the primary
 *   source of truncation.  We derive it from description instead.
 */
const RESPONSE_SCHEMA = {
  type: SchemaType.ARRAY,
  description: "List of extracted common issues and vulnerabilities from app reviews.",
  items: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description: "Clear, descriptive title of the user pain-point or bug. Max 6 words.",
      },
      description: {
        type: SchemaType.STRING,
        description: "Deep, synthesized breakdown of what users are experiencing. Max 25 words.",
      },
      severity: {
        type: SchemaType.STRING,
        enum: ["CRITICAL", "MEDIUM", "LOW"],
        description: "Must be exactly 'CRITICAL' (crashes/data loss), 'MEDIUM' (major annoyance), or 'LOW' (minor friction).",
      },
      impact: {
        type: SchemaType.STRING,
        description: "The percentage impact weight as a clean string, e.g. '53%' or '20%'.",
      },
      category: {
        type: SchemaType.STRING,
        enum: ["UX", "CRASHES", "ACCURACY", "PERFORMANCE", "PRICING", "FEATURES"],
        description:
          "Cluster theme: UX (usability/onboarding), CRASHES (bugs/crashes), ACCURACY (wrong data), PERFORMANCE (speed/battery), PRICING (subscriptions), FEATURES (missing capabilities).",
      },
    },
    required: ["title", "description", "severity", "impact", "category"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitizes a single string for inclusion in the prompt — strips control
 * characters, collapses whitespace, and hard-truncates.
 */
function sanitize(value: string, maxLen: number): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, " ") // control chars → space
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

const VALID_SEVERITIES: IssueSeverity[] = ["CRITICAL", "MEDIUM", "LOW"];
const VALID_CATEGORIES: ReviewInsightCategory[] = [
  "UX",
  "CRASHES",
  "ACCURACY",
  "PERFORMANCE",
  "PRICING",
  "FEATURES",
];

/**
 * Parses the model's string impact value ("45%", "0.45", "45") into a
 * normalised [0.0–1.0] float.  Accepts all three formats defensively.
 */
function parseImpact(raw: unknown): number | null {
  if (typeof raw === "number") {
    // numeric — normalise from percentage if > 1
    return raw > 1 ? Math.min(raw / 100, 1.0) : Math.min(Math.max(raw, 0), 1.0);
  }
  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/%$/, "");
    const n = parseFloat(cleaned);
    if (Number.isNaN(n)) return null;
    // If the number is > 1 it was expressed as a percentage (e.g. "45")
    return n > 1 ? Math.min(n / 100, 1.0) : Math.min(Math.max(n, 0), 1.0);
  }
  return null;
}

/**
 * Validates and coerces the raw parsed value into a well-typed IssueItem[].
 * Drops items with missing required fields.  Hard-caps at MAX_ISSUES.
 */
function parseIssues(raw: unknown): IssueItem[] | null {
  if (!Array.isArray(raw)) return null;

  const items = raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item): IssueItem | null => {
      const title =
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim().slice(0, 60)
          : null;

      const description =
        typeof item.description === "string" && item.description.trim()
          ? item.description.trim().slice(0, 300)
          : null;

      const severityRaw =
        typeof item.severity === "string"
          ? (item.severity.trim().toUpperCase() as IssueSeverity)
          : null;
      const severity: IssueSeverity =
        severityRaw && VALID_SEVERITIES.includes(severityRaw)
          ? severityRaw
          : "MEDIUM";

      const impact = parseImpact(item.impact);

      const categoryRaw =
        typeof item.category === "string"
          ? (item.category.trim().toUpperCase() as ReviewInsightCategory)
          : null;
      const category: ReviewInsightCategory =
        categoryRaw && VALID_CATEGORIES.includes(categoryRaw)
          ? categoryRaw
          : "UX";

      // quote is omitted from the schema — fall back to empty string
      const quote =
        typeof item.quote === "string" ? item.quote.trim().slice(0, 200) : "";

      if (!title || !description || impact === null) return null;
      return { title, description, severity, impact, quote, category };
    })
    .filter((item): item is IssueItem => item !== null)
    .slice(0, MAX_ISSUES);

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `\
You are an elite App Store Optimisation analyst specialising in negative-review triage.
Analyze the provided dataset and return ONLY the top 3 to 5 most statistically significant pain points.
Keep explanations concise, dense, and impactful to ensure your payload fits safely under maximum token restrictions.

## Severity guide
CRITICAL — crashes, data loss, broken core feature, login failures
MEDIUM   — major performance regressions, key flows broken but recoverable, significant annoyances
LOW      — minor UX friction, missing quality-of-life features, cosmetic issues

## Rules
- Return between 3 and 5 issues — never more than 5.
- Order by impact descending (highest percentage first).
- impact must be a percentage string like "45%" representing the share of sampled reviews mentioning this issue.
- category must be one of: UX, CRASHES, ACCURACY, PERFORMANCE, PRICING, FEATURES.
- title must be ≤ 6 words, punchy and action-oriented.
- description must be ≤ 25 words — one dense sentence only.
- If no clear pain points exist, return an empty array.`;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateReviewAnalysisInput = {
  /** Sanitized ≤2★ review texts from the scraper. */
  reviewTexts: string[];
  /** BCP-47 language tag of the reviews, e.g. "en", "ar". */
  langCode?: string;
  /** Optional app / package name for prompt context. */
  appName?: string;
};

/**
 * Sends a batch of low-rating review texts to Gemini and returns structured
 * IssueItem[] clusters with severity + impact metrics.
 *
 * ## Parse stability guarantee
 * Uses `responseMimeType: "application/json"` + `responseSchema` so the SDK
 * enforces valid JSON output at the model layer — eliminating the mid-JSON
 * truncation / "Unterminated string" crash seen with loose text generation.
 *
 * ## Failure contract
 * - Empty reviewTexts → returns { issues: [], usage: null } without calling Gemini.
 * - Gemini API error → throws (caller handles credit refund).
 * - JSON parse failure → logs raw state cleanly, returns { issues: [], usage }.
 * - Empty/invalid array from model → returns { issues: [], usage }.
 */
export async function generateReviewAnalysis(
  input: GenerateReviewAnalysisInput,
): Promise<ReviewAnalysisResult> {
  if (input.reviewTexts.length === 0) {
    return { issues: [], usage: null };
  }

  const langLabel = input.langCode ?? "en";
  const appLabel  = input.appName?.trim() ? sanitize(input.appName, 120) : "this app";

  // ── Build high-density review sample ─────────────────────────────────────
  //
  // Two-stage filtering before the prompt is compiled:
  //   1. Length filter (> MIN_REVIEW_CHARS): drops single-word / emoji-only
  //      entries that add noise without helping the model find clusters.
  //   2. Hard LIMIT (MAX_REVIEWS_FOR_PROMPT = 20): caps TPM exposure and keeps
  //      the prompt compact for fast, stable structured output under load.
  //
  // The filter is applied BEFORE the slice so the 20 slots are filled with the
  // most substantive reviews from the full incoming array.
  const cappedReviews = input.reviewTexts
    .filter((text) => text.trim().length > MIN_REVIEW_CHARS)
    .slice(0, MAX_REVIEWS_FOR_PROMPT);

  const reviewBlock = cappedReviews
    .map((text, i) => `[${i + 1}] ${sanitize(text, 400)}`)
    .join("\n");

  const userPrompt = [
    `App: ${appLabel}`,
    `Review language: ${langLabel}`,
    `Reviews sampled: ${cappedReviews.length} (filtered from ${input.reviewTexts.length} total)`,
    "",
    "=== REVIEWS START ===",
    reviewBlock,
    "=== REVIEWS END ===",
    "",
    `Analyze this highly dense sample of ${cappedReviews.length} critical user complaints and extract the top 3 core software vulnerabilities hurting this application's store conversion rates.`,
  ].join("\n");

  // ── Gemini call — schema-enforced JSON mode ───────────────────────────────
  //
  // generationConfig is declared inline on generateContent (not on the model
  // constructor) so it is self-contained and unambiguous.
  //
  // Key settings:
  //   temperature: 0.2    — low entropy keeps analysis grounded and fast
  //   maxOutputTokens: 2048 — sufficient headroom for 5 detailed issue clusters
  //   responseMimeType    — tells the SDK to parse the response as JSON
  //   responseSchema      — enforces exact shape; SDK rejects non-conforming output
  //                         before it reaches our parse layer, eliminating the
  //                         "Unterminated string / JSON.parse failed" crash.
  // ✅ REFACTORED: Use centralized Vertex AI gateway (no API key needed)
  const model = getGenerativeModel({
    temperature: 0.2,
    maxOutputTokens: 4096,
  });
  model.systemInstruction = SYSTEM_INSTRUCTION;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature:      0.2,
      topP:             0.9,
      maxOutputTokens:  4096,
      responseMimeType: "application/json",
      responseSchema:   RESPONSE_SCHEMA,
    },
  });

  const rawText = extractText(result);
  const usage = parseGeminiUsageMetadata(extractUsageMetadata(result));

  // ── Empty response guard ──────────────────────────────────────────────────
  if (!rawText?.trim()) {
    console.warn("[generateReviewAnalysis] model returned empty text — returning []");
    return { issues: [], usage };
  }

  // ── Truncation recovery guard ─────────────────────────────────────────────
  //
  // Even with responseSchema + 4 096-token headroom, the model can occasionally
  // cut off mid-output (network timeout, TPM spike, rate-limit).  When that
  // happens the raw text starts with '[' but lacks the closing ']', leaving
  // trailing artefacts like '},' that make JSON.parse throw "Unexpected end of
  // JSON input".  This guard heals the three most common truncation patterns
  // before the text reaches JSON.parse:
  //   1. Trailing comma after the last complete object  → stripped
  //   2. Last object block unclosed (open > close '{')  → '}' appended
  //   3. Closing array bracket missing                  → ']' appended
  //
  // The repaired string only ever surfaces complete objects — `parseIssues`
  // validates field presence, so any partially written object that survived is
  // silently dropped at the validation layer rather than poisoning the cache.
  let processedText = rawText.trim();

  if (processedText.startsWith("[") && !processedText.endsWith("]")) {
    console.warn(
      "[JSON Repair Guard]: Detected unclosed array structure. Attempting to heal string token values...",
    );

    // 1. Strip trailing comma left after the last complete object
    if (processedText.endsWith(",")) {
      processedText = processedText.slice(0, -1);
    }

    // 2. Close an unclosed object block
    const openBraces  = (processedText.match(/\{/g) ?? []).length;
    const closeBraces = (processedText.match(/\}/g) ?? []).length;
    if (openBraces > closeBraces) {
      processedText += "\n  }";
    }

    // 3. Seal the container array
    processedText += "\n]";
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  // With responseMimeType:"application/json" + responseSchema the SDK guarantees
  // structurally valid JSON under normal conditions — no markdown backtick
  // stripping needed.  The recovery guard above handles the truncation edge-case;
  // the try/catch below is the final safety net.
  let parsed: unknown;
  try {
    parsed = JSON.parse(processedText);
  } catch (parseErr) {
    // Log the full raw response so the exact truncation point is visible.
    console.warn("[Gemini Output]:", rawText);
    console.error("[generateReviewAnalysis] JSON.parse failed — returning [].", {
      parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
      rawLength:  rawText.length,
      rawSlice:   rawText.slice(0, 400),
    });
    return { issues: [], usage };
  }

  // ── Validate schema ───────────────────────────────────────────────────────
  const issues = parseIssues(parsed);
  if (issues === null) {
    // Return empty array — same reasoning as the JSON.parse failure above.
    console.warn("[generateReviewAnalysis] parsed value is not an array — returning [].", {
      receivedType: typeof parsed,
      receivedKeys: parsed !== null && typeof parsed === "object"
        ? Object.keys(parsed as object).join(", ")
        : "n/a",
    });
    return { issues: [], usage };
  }

  return { issues, usage };
}
