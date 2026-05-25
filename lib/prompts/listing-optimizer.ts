import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";

const PROMPT_VERSION = "listing-optimizer-v4";

export function getListingOptimizerPromptVersion(): string {
  return PROMPT_VERSION;
}

const TONE_FOR_PROMPT: Record<ToneStyle, string> = {
  professional: "Clear & Benefit-focused, professional",
  friendly: "Clear & Benefit-focused, friendly",
  bold: "Clear & Benefit-focused, bold",
  minimal: "Clear & Benefit-focused, minimal",
};

/**
 * Full ASO strategist brief + markdown output spec (e.g. for docs, evals, or non-JSON tools).
 * For the live API, {@link buildListingOptimizerMessages} reuses the same rules but requires JSON.
 */
export const listingOptimizerPrompt = (
  appName: string,
  category: string,
  keywords: string[],
  tone: string = "Clear & Benefit-focused",
  targetArabic: boolean = false,
) => `
You are an expert Google Play ASO Strategist for indie Android developers.

App: ${appName}
Category: ${category}
Primary Keywords: ${keywords.join(", ")}

Rules:
- Title: at most 30 characters (hard limit; never exceed).
- Short description: CRITICAL CHARACTER LIMIT — strictly under 75 characters (hard cap; never exceed). One sharp conversion hook; count every character before outputting.
- Long description: at most 4000 characters — Feature → Benefit structure with bullet points and sections.
- Naturally integrate keywords without stuffing.
- Tone: ${tone}. Professional but approachable. No generic marketing fluff.
${
  targetArabic
    ? "- Language: Provide natural, modern Arabic (MSA/Gulf mix suitable for MENA) for all sections below."
    : "- Language: Write in clear English unless the app or audience clearly requires another language."
}

Output in this exact format:

**Optimized Title**
[Title]

**Short Description**
[Short desc]

**Long Description**
[Full description with proper formatting]

**Keyword Strategy**
• Primary keywords used
• Secondary opportunities

**Expected Impact**
Short explanation of ranking & conversion potential.
`.trim();

function listingOptimizerStrategyBlock(
  appName: string,
  category: string,
  keywords: string[],
  tone: string,
  targetArabic: boolean,
): string {
  return [
    "You are an expert Google Play ASO Strategist for indie Android developers.",
    "",
    `App: ${appName}`,
    `Category: ${category}`,
    `Primary Keywords: ${keywords.join(", ")}`,
    "",
    "Rules (Google Play HARD limits — counts every character including spaces and punctuation):",
    "- Title: at most 30 characters (never 31+). Include primary keyword naturally.",
    "- Short description: CRITICAL CHARACTER LIMIT — You MUST keep the generated Short Description strictly under 75 characters. Do not write marketing phrases that require truncation or post-processing clamping loops. Count every character before outputting. Never exceed 74 characters.",
    "- Long description: fewer than 4000 characters in practice — stay at or under 4000. Feature → Benefit structure, bullets/sections where helpful.",
    "- Naturally integrate keywords without stuffing.",
    `- Tone: ${tone}. Professional but approachable. No generic marketing fluff.`,
    targetArabic
      ? "- Arabic: All user-visible strings in your JSON output must be natural, modern Arabic (MSA/Gulf mix suitable for MENA), except proper nouns where appropriate."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt token-budget constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum number of target keywords injected into the prompt.
 * Slicing to 25 keeps the keyword line under ~300 tokens while still covering
 * all high-priority ASO terms. Passing 60+ keywords produces diminishing returns
 * and bloats the prompt enough to trigger 502 timeouts on slower Gemini nodes.
 */
const PROMPT_MAX_KEYWORDS = 25;

/**
 * Maximum number of exploit / competitor pain-point strings injected into the
 * displacement campaign block. Beyond 5, the prompt context is filled with raw
 * review text that the model cannot meaningfully act on within a single listing
 * output — causing latency spikes and incoherent copy.
 */
const PROMPT_MAX_EXPLOIT_TARGETS = 5;

/**
 * Normalise and deduplicate a keyword list, then cap at `PROMPT_MAX_KEYWORDS`.
 * Trim whitespace, lower-case for dedup, but preserve original casing in output.
 */
function truncateKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const kw of raw) {
    const trimmed = kw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= PROMPT_MAX_KEYWORDS) break;
  }
  return out;
}

/**
 * Trim and cap the exploit targets array to `PROMPT_MAX_EXPLOIT_TARGETS`.
 * Each entry is also trimmed so stray whitespace from sessionStorage doesn't
 * waste tokens.
 */
function truncateExploitTargets(raw: string[]): string[] {
  return raw
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, PROMPT_MAX_EXPLOIT_TARGETS);
}

/**
 * System + user messages for Gemini. Output must be JSON per schema in system.
 *
 * Token-budget enforcement:
 *   - targetKeywords is capped at PROMPT_MAX_KEYWORDS (25) after dedup.
 *   - exploitTargets is capped at PROMPT_MAX_EXPLOIT_TARGETS (5).
 * These limits prevent prompt bloat that causes 502 timeouts on large payloads
 * while preserving all actionable signal for the model.
 */
export function buildListingOptimizerMessages(input: ListingOptimizerInput): {
  system: string;
  user: string;
} {
  const tone = TONE_FOR_PROMPT[input.toneStyle];
  const targetArabic = input.targetArabic ?? false;

  // ── Token-budget enforcement ───────────────────────────────────────────────
  // Truncate before any string interpolation so the budget is guaranteed even
  // when the client sends a very large keyword or exploit payload.
  const keywords = truncateKeywords(input.targetKeywords);
  const exploitTargets = truncateExploitTargets(input.exploitTargets ?? []);
  // ─────────────────────────────────────────────────────────────────────────

  const system = [
    "You are an expert Google Play ASO copywriter and strategist for Android apps on Google Play.",
    "Prioritize install conversion: clear benefits, honest claims, scannable copy — while strictly obeying character limits below (counts every character).",
    "In ONE response (no tool calls), execute this workflow internally: (1) Draft listing copy from the inputs. (2) Self-audit against the primary keywords and Google Play ASO best practices (honest claims, no keyword stuffing, strong hooks, scannable structure). (3) Rewrite weaker sections until the listing is cohesive. (4) Score the final listing with the rubric below and output a single JSON object only.",
    "Return a single JSON object only (no markdown, no code fences, no prose before or after) with exactly these keys:",
    "title: string — Google Play title, at most 30 characters (hard cap 30, never 31+); include primary keyword naturally.",
    "shortDescription: string — CRITICAL: at most 74 characters (hard cap 74, never 75+). One sharp hook; count every character before outputting; do NOT write marketing phrases that require post-processing truncation.",
    "longDescription: string — at most 4000 characters (stay ≤4000). Feature → Benefit structure, sections, bullets where helpful; weave keywords naturally, no stuffing. (Synonym: you may instead send fullDescription with the same content; prefer longDescription.)",
    "keywordSuggestions: array of 8-20 concise keyword phrases for ASO.",
    "ctaSuggestions: array of 3-8 short conversion-focused CTAs or button-style lines.",
    "aso_score: integer from 0 to 100 — Certified ASO Score; MUST equal the sum of the four values in score_breakdown (within 1 if rounding).",
    "score_breakdown: object with exactly these numeric keys (each an integer; use these exact spellings): title (0–30 max), shortDescription (0–20 max), longDescription (0–40 max), persuasiveness (0–10 max). The four values MUST sum to aso_score.",
    "improvement_tips: array of 2–8 short, actionable ASO tips specific to this listing (not generic platitudes).",
    "Align with Google Play policies: honest claims, no misleading text.",
    targetArabic
      ? "All user-visible string values in the JSON (title, descriptions, tips, keywordSuggestions, ctaSuggestions) must be natural modern Arabic (MSA/Gulf mix for MENA), except proper nouns where appropriate. Numeric scores stay as numbers."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Pass the budget-capped keyword list to the strategy block.
  const strategy = listingOptimizerStrategyBlock(
    input.appName,
    input.category,
    keywords,          // ← truncated, not the raw input
    tone,
    targetArabic,
  );

  const refinement =
    typeof input.userInstruction === "string" && input.userInstruction.trim()
      ? [
          "",
          "Additional direction from the product owner (apply on top of the rules above):",
          input.userInstruction.trim(),
        ].join("\n")
      : "";

  // Only inject the displacement block when there are staged targets.
  // exploitTargets is already capped at PROMPT_MAX_EXPLOIT_TARGETS (5).
  const exploitBlock =
    exploitTargets.length > 0
      ? [
          "",
          "🔥 CRITICAL INSTRUCTIONS — STRATEGIC DISPLACEMENT CAMPAIGN:",
          `The user has staged ${exploitTargets.length} competitive pain point${exploitTargets.length !== 1 ? "s" : ""} to exploit: [${exploitTargets.join(", ")}].`,
          "For each staged target, apply the matching displacement strategy when writing title, shortDescription, and longDescription:",
          "- If a target relates to stability or performance flaws (e.g., 'Bug / Crash', 'Crashes', 'Freezes'), position this app as an ultra-stable, battle-tested alternative. Use language like 'zero crashes', 'rock-solid performance', or 'built to last'.",
          "- If a target relates to monetization friction (e.g., 'Ads too intrusive', 'Too many ads', 'Paywalled features'), highlight a smooth premium experience, fair pricing, or ad-light design.",
          "- If a target relates to missing features or limited functionality (e.g., 'Missing feature', 'Limited', 'Basic'), showcase this app's depth and comprehensive feature set.",
          "- If a target relates to poor UX or confusing navigation (e.g., 'Hard to use', 'Confusing UI', 'Poor UX'), emphasize intuitive design, ease of use, and fast onboarding.",
          "- If a target relates to negative sentiment or general dissatisfaction (e.g., 'Disappointing', 'Overpriced', 'Not worth it'), craft copy that directly addresses value, trust, and user satisfaction.",
          "- For any other target not matched above, infer the most relevant displacement angle (reliability, value, features, UX) and apply it assertively.",
          "Seamlessly blend these competitive marketing angles into the storefront metadata copy without breaking character limits. Do not reference competitor names directly. The displacement must read as natural feature positioning, not attack advertising.",
        ].join("\n")
      : "";

  const user = [
    strategy,
    "",
    "Using the rules above, produce the JSON object described in the system message (including aso_score, score_breakdown, and improvement_tips).",
    "",
    "REMINDER — hard limits on your JSON strings (count every character): title ≤30, shortDescription ≤74 (CRITICAL: never exceed 74 characters — do not write marketing phrases that need truncation or clamping), longDescription ≤4000. Prioritize conversion; shorten shortDescription aggressively if needed.",
    "",
    "App features / value props:",
    input.appFeatures,
    refinement,
    exploitBlock,
  ].join("\n");

  return { system, user };
}
